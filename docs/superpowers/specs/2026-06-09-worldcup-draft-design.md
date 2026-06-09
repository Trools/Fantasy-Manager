# World Cup 2026 Fantasy Draft — Design Spec

**Date:** 2026-06-09
**Status:** Approved design, pending implementation plan

## 1. Purpose

A live, NFL-style **snake draft** web app for the 2026 football (soccer) World Cup, for home
use among a small group (4–8 participants). Participants take turns drafting real World Cup
players; each real player can be drafted by exactly one participant (globally unique). The app
**only decides who gets which players** — the actual fantasy game is played on a separate
platform. The draft happens **live**: the lobby, settings changes, pick order, the pick timer,
and every pick update in real time for all connected viewers.

## 2. Users & roles

- **Visitor / participant**: anyone can self-register a username + password and use the app
  immediately. No email, no verification (home use).
- **Admin**: the **first account to register** automatically becomes admin. Admin can also
  promote/demote other users to admin (role is not limited to one). Admin powers:
  - Configure draft settings (live).
  - Randomize / re-randomize pick order; start, pause, resume the draft.
  - During the draft: undo the last pick, pick on behalf of the current user, extend the timer.
  - Reset any user's password to the configured default temp password.
  - CRUD the player dataset (corrections).

Security is intentionally light (home use) but done correctly where cheap: passwords are
hashed, sessions are signed and revocable.

## 3. Architecture (Cloudflare, single deploy)

A single Cloudflare **Worker**, deployed with one `wrangler deploy`, does three jobs:

1. **Serves the SPA** — React + Vite + Tailwind front-end, served via the **Workers Static
   Assets** binding (edge CDN caching).
2. **Hono API** — REST endpoints for auth, account, admin, and player data.
3. **WebSocket upgrade** — `/ws` upgrades and routes to the Durable Object.

**`DraftRoom` Durable Object** (single instance, fixed name `"main"`):

- Authoritative live draft state held in memory.
- Owns all WebSocket connections using the **Hibernatable WebSockets API**
  (`ctx.acceptWebSocket`, `webSocketMessage`/`webSocketClose`/`webSocketError` handlers,
  per-socket metadata via `ws.serializeAttachment({ userId, username })`). This lets the DO
  hibernate while the lobby sits idle (no continuous billing) and still be woken by alarms.
- Runs the **pick timer** via DO alarms.
- **Broadcasts** every change (settings edit, pick, timer tick/expiry, order change,
  pause/resume) to all connected clients.
- **Write-through to D1** on each state change so the DO can rehydrate after eviction.
- On every WS connect/reconnect, sends a **full state snapshot** (prevents client desync).

**D1 (SQLite)**: durable storage for users, players, settings, participants, picks.

```
Browser (React SPA)
   │  REST (/api/*)            ┌──────────────┐
   ├──────────────────────────▶│   Worker     │──── D1 (users, players, settings,
   │  WebSocket (/ws) ─────────▶│ (Hono + DO   │         participants, picks)
   │                            │  router)     │
   │◀─── broadcasts ────────────│   └─▶ DraftRoom DO (live state, timer, sockets)
```

## 4. Data model (D1)

```sql
users(
  id INTEGER PK,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,        -- PBKDF2-SHA256, 200k iters, 16-byte salt, 32-byte out
  password_salt TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 0,  -- bumped on password reset → revokes old cookies
  created_at INTEGER NOT NULL
)

players(
  id INTEGER PK,
  country TEXT NOT NULL,
  country_code TEXT NOT NULL,          -- e.g. ARG, ALG (for flag rendering)
  position TEXT NOT NULL,              -- GK | DEF | MID | FWD
  shirt_number INTEGER,
  full_name TEXT NOT NULL,
  name_on_shirt TEXT,
  club TEXT,
  dob TEXT,
  active INTEGER NOT NULL DEFAULT 1    -- admin can disable instead of delete
)

draft_settings(                        -- single row (id = 1)
  id INTEGER PK CHECK (id = 1),
  total_picks INTEGER NOT NULL,
  seconds_per_pick INTEGER NOT NULL,
  pos_min TEXT NOT NULL,               -- JSON {"GK":n,"DEF":n,"MID":n,"FWD":n}
  pos_max TEXT NOT NULL,               -- JSON {"GK":n,"DEF":n,"MID":n,"FWD":n}
  max_per_country INTEGER NOT NULL,
  order_mode TEXT NOT NULL DEFAULT 'snake',   -- enum: 'snake' | 'linear'
  status TEXT NOT NULL DEFAULT 'lobby',        -- lobby | in_progress | paused | complete
  current_pick_no INTEGER,             -- overall pick index the draft is on
  timer_deadline INTEGER,              -- Unix ms; written atomically with the alarm
  temp_password TEXT NOT NULL          -- configurable default used by admin reset
)

participants(
  user_id INTEGER PK REFERENCES users(id),
  draft_order INTEGER,                 -- 1..N, set at randomize; NULL until then
  joined INTEGER NOT NULL DEFAULT 1
)

picks(
  overall_no INTEGER PK,               -- 1..(N * total_picks), the global pick sequence
  round_no INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  picked_by_user_id INTEGER NOT NULL,  -- = user_id normally; = admin id if pick-on-behalf
  picked_at INTEGER NOT NULL
)
```

Note: D1 does not reliably enforce foreign keys, so referential integrity (e.g. blocking
deletion of a drafted player) is enforced at the application layer.

## 5. Authentication & sessions

- **Sessions**: stateless **signed HMAC cookie**. Payload:
  `{ userId, username, isAdmin, mustChangePwd, tokenVersion, iat }`, signed with a server
  secret (Worker secret).
- **Register**: create user, hash password, set cookie, log in immediately. If this is the
  first user ever, set `is_admin = 1`.
- **Login**: verify hash, issue fresh cookie.
- **Revocation**: each authenticated request loads the user row and checks
  `cookie.tokenVersion === user.token_version`. A password reset bumps `token_version`,
  invalidating all existing cookies for that user (the reset participant is logged out).
- **Forced password change**: when `must_change_password = 1`, Hono middleware returns
  `403 { reason: 'must_change_password' }` for every API route except the change-password
  endpoint (and auth/logout). Enforced server-side, not just in the UI. Clearing a new
  password sets the flag to 0 and bumps `token_version`.
- **Admin password reset**: sets `password_hash` to the configured **single default temp
  password** (`draft_settings.temp_password`, e.g. `worldcup2026`), sets
  `must_change_password = 1`, bumps `token_version`. Admin tells the user the known default.
- **Hardening (light)**: PBKDF2-SHA256 @ 200k iterations; CSP header via Hono middleware;
  rate-limit on `/api/register` and `/api/login` via the Workers rate-limit binding.

## 6. Player data pipeline

- A **build-time Node script** parses `docs/players/SquadLists-English.pdf` (the official FIFA
  squad list: 48 teams × 26 players) into `players.json`. The PDF's two-column interleaved
  layout is correlated by player name; position codes map **DF→DEF, MF→MID, FW→FWD, GK→GK**.
  Each record: country, country_code, position, shirt_number, full_name, name_on_shirt, club,
  dob.
- Seeded into D1 at deploy time via **batched inserts** (~100 rows per `db.batch()` /
  multi-value `INSERT`) to stay within D1 per-query limits. Tested locally with
  `wrangler d1 execute --local` first.
- Admin player CRUD allows fixes; players already drafted cannot be deleted (use `active=0`).

## 7. Draft settings (live-adjustable in the lobby)

All editable by admin while `status = lobby`; every change is broadcast to all viewers
instantly.

| Setting | Meaning |
|---|---|
| `total_picks` | Players each participant drafts (= rounds). |
| `seconds_per_pick` | Per-pick countdown (admin may enter minutes; stored as seconds). |
| `pos_min` / `pos_max` | Per-position minimum and maximum each participant must / may hold (GK/DEF/MID/FWD). |
| `max_per_country` | Max players one participant may draft from a single national team. |
| `order_mode` | `snake` (default) or `linear`. |
| `temp_password` | The fixed default applied by admin password reset. |

**Validation** (warned in UI, enforced before start): `total_picks ≥ sum(pos_min)`;
`total_picks ≤ sum(pos_max)`; each `pos_min ≤ pos_max`; `max_per_country ≥ 1`.

## 8. Draft lifecycle

State machine on `draft_settings.status`:

```
lobby ──(admin: randomize order)──▶ lobby (order set)
lobby ──(admin: start)──▶ in_progress
in_progress ──(timer expires)──▶ paused
in_progress / paused ──(admin: pause/resume)──▶ paused / in_progress
in_progress ──(all participants reach total_picks)──▶ complete
```

- **Lobby**: participants join (added to `participants`). Admin edits settings (live broadcast),
  hits **Randomize order** (Fisher–Yates shuffle of joined participants → `draft_order`;
  re-randomizable until start), then **Start**.
- **Snake order**: round 1 picks in order `1→N`, round 2 `N→1`, round 3 `1→N`, … For each
  `current_pick_no` the DO computes whose turn it is. (`linear` mode keeps `1→N` every round.)
- **Making a pick** (DO handler, **synchronous guard + mutate, then await persist**):
  1. Verify it is this user's turn and the player is available (sync).
  2. Verify eligibility (sync) — see §9.
  3. Mutate in-memory state (record pick, advance `current_pick_no`, reset timer deadline)
     and **broadcast** — all synchronous, no `await` between guard and mutation (prevents
     double-pick races).
  4. `await` write-through to D1 (`picks` row + updated `current_pick_no` + `timer_deadline`).
- **Timer**: DO alarm set to `timer_deadline`. On expiry → `status = paused`, broadcast.
- **Timeout = pause for admin**. Admin then chooses: **Resume** (fresh timer for current
  picker), **Extend** timer, **Pick on behalf** of the current user, or **Undo last pick**.
- **Undo**: undoes only the **most recent** pick; returns the turn to that picker with a full
  fresh timer; allowed while paused. Removes the `picks` row, rolls `current_pick_no` back one,
  rebroadcasts.
- **Complete**: when every participant has `total_picks` picks. Shows the final board (§10).

**Rehydration after DO eviction**: on load, the DO reads `draft_settings` + `picks` from D1,
rebuilds in-memory state, and — if `status = in_progress` and `timer_deadline` is set —
re-arms the alarm (`ctx.storage.setAlarm(timer_deadline)`) so the draft never silently stalls.

## 9. Pick eligibility (per-user forward feasibility)

When it is a user's turn, each available player is **eligible** only if drafting them keeps the
user's roster completable. The check is **per-user** (each user has their own remaining picks
and roster):

- **`pos_max`**: drafting this position must not exceed the user's max for it.
- **Forward feasibility for `pos_min`**: after tentatively adding this pick, the user's
  remaining picks (`total_picks − currentCount − 1`) must still be able to satisfy every unmet
  `pos_min`. Greedy check: `sum(max(0, pos_min[p] − rosterAfter[p])) ≤ remainingAfter`, and no
  position is already over `pos_max`.
- **`max_per_country`**: drafting must not exceed the user's per-country cap. Re-checked at
  pick time (not only at display time) because other users' picks change availability
  concurrently.

Ineligible players are shown **greyed with the reason** ("FWD full", "Max 🇧🇷", "would leave
GK minimum unreachable").

## 10. Front-end

**Pages / routes (SPA):**
- `/register`, `/login`
- `/change-password` (forced when `must_change_password`)
- `/` — the live room. Renders **lobby** or **draft** or **complete** view per `status`.
- `/admin` — settings editor, user management (reset password, promote/demote), player CRUD,
  draft controls (randomize, start, pause/resume, undo, pick-on-behalf, extend).

**Live draft room — List-centric layout (chosen):**
- **Top bar** (shared across views): round indicator, order mode, **who's on the clock**, and a
  large countdown **timer**.
- **Main panel**: the **available-players list** — searchable, filterable by country and
  position, sortable. Each row: **country flag → position badge → player name** + club, with a
  Draft button when it's your turn (greyed + reason when ineligible).
- **Side panel**: **your roster** grouped by position showing fill vs `min–max`, plus the
  **live pick feed** (`flag · POS · name — by user`).
- The **full board grid** (users × rounds, snake flow) is available as a **tab**.

**Complete view**: final draft board on-screen, plus **copy-to-clipboard** formatted text
grouped by user (each line `country · POS · player name`) for pasting into the other platform.

**Display ordering** everywhere picks are shown: **country → position → player name**.

**Responsive** for phones (primary reason list-centric was chosen over the board-centric grid).

## 11. Non-functional / scope

- Single active draft at a time. Admin can **reset** to start a new draft (clears
  `participants`/`picks`, returns `status` to `lobby`; player data persists).
- Target group size 4–8 (UI density and snake math assume this range; works beyond it).
- Everything hosted on Cloudflare; no third-party realtime services.

## 12. Out of scope (YAGNI)

- Email/verification, password recovery flows (admin reset covers it).
- Multiple simultaneous drafts / leagues.
- Player queue / auto-draft preferences (timeout pauses for admin instead).
- Max-per-club constraint (not selected).
- Scoring or playing the fantasy game (done on the other platform).

## 13. Key risks & mitigations (from architecture review)

| Risk | Mitigation |
|---|---|
| Reset user stays logged in (stateless cookie) | `token_version` bumped on reset; checked per request. |
| Timer lost on DO eviction → draft stalls | `timer_deadline` persisted; alarm re-armed on rehydration. |
| Double-pick race | Synchronous guard+mutate+broadcast before any `await` in DO. |
| Idle lobby billing / alarms not waking | Hibernatable WebSockets API. |
| Wrong min/max eligibility | Per-user forward feasibility check (§9). |
| 1,248-row seed exceeds D1 query limits | Batched inserts (~100/batch). |
| Deleting a drafted player orphans picks | App-level guard; `active=0` instead of delete. |
| Client desync on reconnect | Full-state snapshot on every WS connect. |
