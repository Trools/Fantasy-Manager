# World Cup 2026 Fantasy Draft — Frontend Design Brief

**Date:** 2026-06-09
**For:** A non-developer designing the visuals in Claude's design/artifact tool
**Source of truth:** `docs/superpowers/specs/2026-06-09-worldcup-draft-design.md` (approved). If anything here conflicts with the spec, the spec wins.

## How to use this brief

This is a **visual design brief**, not code and not a feature spec. It tells you *what each screen contains, how it should feel, and what every state looks like* so you can mock the screens in Claude's design tool. Everything below is consistent with the approved spec: a **live, NFL-style snake draft** for the 2026 football (soccer) World Cup, **home use, 4–8 people**, fully real-time (lobby, settings, pick timer, picks all update live). The app **only decides who drafts which real players** — no scoring, no gameplay.

**One rule that repeats everywhere — memorize it:** any time a player or a pick is shown, the order is **country flag → position → player name** (then club as a smaller detail). Never reorder these. This single convention is what makes the whole app feel coherent.

---

## 1. Design language / mood

**Tone:** energetic, "draft night" sports-broadcast feel — confident, a little loud, fast-reading. Think a TV draft-tracker crossed with a clean modern web app. Dense with information but never cluttered; the eye should always know where "what's happening right now" lives (the timer + who's on the clock).

### Direction options (pick one, then stay consistent)

**Option A — "Stadium Night" (recommended).** Dark UI, floodlit-pitch energy. Deep charcoal/navy background, bright accent (electric green or gold) for live/active elements, white text. Tradeoffs: best for the live timer + "on the clock" urgency, looks premium, easy on eyes during a long draft; risk is it can feel heavy if accents are overused — keep accents reserved for *live* and *your turn*.

**Option B — "Broadcast Bold."** Light-to-mid neutral base (off-white / light grey) with strong saturated team-sport accents and chunky type. Tradeoffs: very legible, friendly, prints/screenshots well for the copy-to-clipboard moment; risk is it reads more "spreadsheet" than "draft night" unless the timer and feed are given strong color.

**Option C — "Minimal Pitch."** Mostly monochrome with a single green accent and lots of whitespace. Tradeoffs: cleanest and most timeless, scales well on mobile; risk is it may feel under-energized for a live sports draft — would need motion/animation to carry the excitement.

**Recommendation: Option A (dark), with a light-mode variant as a stretch.** Dark mode best supports a long live session and makes the countdown timer and "your turn" state pop. If you only design one, design dark.

### Color starting points
- **Background:** near-black charcoal or deep navy (e.g. `#0E1116` / `#0B1220`).
- **Surface/cards:** one step lighter than background; subtle borders, not heavy shadows.
- **Primary accent (live / your-turn / Draft button):** electric green (`#22C55E`-ish) or gold (`#F5C518`-ish). Pick one as primary.
- **Text:** near-white primary, muted grey secondary; ensure contrast (see accessibility).
- **Position color-coding (use consistently for every position badge, see below).**

### Position color-coding convention (GK / DEF / MID / FWD)
Use a fixed, learnable palette so people read position by color at a glance. Each badge = small colored chip with the 2–3 letter code.

| Position | Code | Suggested color | Note |
|---|---|---|---|
| Goalkeeper | **GK** | Amber / yellow | distinct, "special" |
| Defender | **DEF** | Blue | cool, solid |
| Midfielder | **MID** | Green | central / link |
| Forward | **FWD** | Red / orange | attack, hot |

Don't rely on color alone — always show the **text code** too (colorblind safety). Keep the same mapping on badges, filters, roster meters, and the board grid.

### Country flags
- Show flags as a **small rounded-rectangle flag chip** (not a circle — flags distort as circles). Driven by `country_code` (ARG, FRA, BRA…).
- Always pair the flag with the country name *or* code on first/large appearances; in dense lists the flag alone + player name is fine since the name disambiguates.
- Provide a **graceful fallback**: if a flag image is missing, show the 3-letter code in a neutral chip. Never leave an empty box.
- Flags are decorative-but-identifying: give them an `alt`/label of the country name for screen readers.

### Accessibility notes
- **Contrast:** body text ≥ 4.5:1, large text/badges ≥ 3:1 against their surface. On dark backgrounds verify the muted-grey secondary text still passes.
- **Never color-only:** position (badge text), eligibility (greyed + reason text), and live state (label like "LIVE", "Your turn") must all carry a text/shape cue, not just hue.
- **Timer legibility & urgency:** the countdown must be the most legible thing on the live screen — large, monospaced/tabular numerals so digits don't jitter. Three visual states (normal / urgent / expired, defined in §3). Urgency should be conveyed by **size + color + label**, optionally a subtle pulse — not by color alone, and not by sound only.
- **Motion:** keep live animations subtle and respect reduced-motion; the pick feed and timer pulse should be calm endough not to distract during a long session.
- **Touch targets:** Draft buttons and filter controls ≥ 44px on mobile.

---

## 2. Page-by-page breakdown

Routes (per spec): `/register`, `/login`, `/change-password`, `/` (live room — renders lobby / draft / complete by status), `/admin`.

Example content uses real WC 2026 squad members for realism (e.g. 🇦🇷 Lionel Messi, 🇫🇷 Kylian Mbappé, 🇧🇷 Vinícius Júnior, 🇵🇹 Cristiano Ronaldo / Bernardo Silva, 🇪🇸 Pedri, 🇳🇴 — not qualified, avoid; 🇺🇸 Christian Pulisic, 🇧🇪 Kevin De Bruyne, 🇲🇦 Achraf Hakimi, 🇯🇵 Takefusa Kubo, 🇨🇲 André Onana (GK)).

### 2.1 Register / Login
- **Purpose:** self-serve account creation (username + password, no email) and sign-in. **First-ever account becomes admin** — worth a small note on the register screen.
- **Who sees it:** anyone not logged in.
- **Key elements:** app title/logo lockup, username field, password field, primary submit, a link to switch between Register/Login, light error area.
- **States:**
  - *Default:* empty form, focused username.
  - *Loading:* button shows spinner / "Creating account…".
  - *Error:* "Username already taken", "Incorrect username or password", rate-limit notice ("Too many attempts, try again shortly").
  - *First-user hint (register only):* small note — "You're the first here — you'll be the draft admin."
- **Example copy:** Title "World Cup 2026 Draft". Button "Create account" / "Log in".

### 2.2 Forced change-password
- **Purpose:** when an admin has reset a user's password, that user **must** set a new one before doing anything else (enforced server-side; UI mirrors it).
- **Who sees it:** any user with `must_change_password`. They land here and can't navigate away into the app.
- **Key elements:** explanation banner, new-password + confirm fields, submit. No "skip".
- **States:** default; loading; error ("Passwords don't match", "Choose a different password from the temporary one"); success → redirect into the room. Note that on success the user's old sessions are invalidated (they stay logged in here, others log out) — no UI needed but don't promise "logged in everywhere".
- **Example copy:** Banner — "Your password was reset by an admin. Set a new password to continue." Default temp password is told to them out-of-band (e.g. `worldcup2026`); don't display it here.

### 2.3 Lobby (pre-draft)
- **Purpose:** gather participants, let admin configure the draft live, set pick order, and start. Everyone watches it update in real time.
- **Who sees it:** all logged-in users while `status = lobby`. Admin sees editable controls; participants see the same info **read-only and live**.
- **Key elements:**
  - **Participant list:** each joined user with their flag-free avatar/initial, name, and (after randomize) their **draft order number**. Show "You" tag on self, "Admin" tag on admins, a connection dot (online/offline).
  - **Settings panel:**
    - *Admin view (editable):* `total_picks` (rounds), `seconds_per_pick` (accept minutes, show "= 90s"), per-position **min/max** for GK/DEF/MID/FWD (a small 4-row grid), `max_per_country`, `order_mode` (Snake / Linear toggle), `temp_password`. Every edit broadcasts instantly.
    - *Participant view (read-only):* same values rendered as a clean summary card, with a subtle "live" indicator so they trust it's current.
  - **Order + start controls (admin):** "Randomize order" (re-runnable until start), "Start draft" (disabled until valid).
  - **Validation warnings:** inline, near the offending field and summarized near Start. Rules: `total_picks ≥ sum(pos_min)`, `total_picks ≤ sum(pos_max)`, each `pos_min ≤ pos_max`, `max_per_country ≥ 1`.
- **States:**
  - *Empty / waiting:* few participants — "Waiting for players to join… (2 of 4–8)".
  - *Live edit:* participant sees a setting flip with a brief highlight; toast "Admin set pick timer to 90s".
  - *Order set:* participant rows show 1…N badges; admin can re-randomize.
  - *Invalid:* Start disabled, warning chip "Can't start: total picks (5) is less than required minimums (6)".
  - *Not-admin:* controls hidden/disabled with a quiet "Only the admin can change settings."
  - *Error/disconnect:* "Reconnecting…" banner; on reconnect the full state refreshes (no stale values).
- **Example content:** Participants — Erik, Mara, Sam, Dewi. Settings — 9 picks, 90s/pick, min {GK1,DEF3,MID3,FWD1} / max {GK2,DEF5,MID5,FWD3}, max 3 per country, Snake. After randomize: 1 Mara · 2 Sam · 3 Erik · 4 Dewi.

### 2.4 Live draft room (list-centric) — the centerpiece
- **Purpose:** run the draft. Read the room fast: whose turn, how long left, who's available, what's mine.
- **Who sees it:** all logged-in users while `in_progress` / `paused`. The same layout for everyone; the **Draft** affordance only activates on **your turn**.
- **Layout (list-centric):**
  - **Top bar (shared, sticky):** Round indicator ("Round 3 of 9"), order-mode chip ("Snake"), **who's on the clock** (their flag-free avatar + name, e.g. "On the clock: Sam"), and the **big countdown timer** (dominant element). On your turn, the bar adopts the your-turn accent and reads "You're on the clock".
  - **Main panel — available-players list:** the hero. Top controls: **search** (by name/club), **country filter**, **position filter** (GK/DEF/MID/FWD pills using the position colors), **sort** (name, country, position, maybe shirt #). Each **row = flag → position badge → player name** + smaller club line, with a **Draft** button on the right. Ineligible rows are **greyed with a reason** (see microcopy). Virtualized/long list — design for ~600+ available rows scrolling smoothly.
  - **Side panel — your roster:** grouped by position; each position shows a **fill-vs-min–max meter** (e.g. "MID 2 / min 3 · max 5"). Met-minimum positions look satisfied; unmet ones are visually nudgy. Below it the **live pick feed**: reverse-chronological `flag · POS · name — by user` (e.g. "🇦🇷 FWD Messi — by Erik"). New entries slide in.
  - **Board grid (tab):** a second tab toggles the **full board** — participants as columns, rounds as rows, snake flow indicated (arrows/zigzag or alternating row direction). Each filled cell is the compact pick unit (flag · POS · name). Current pick cell is highlighted.
- **Important states:**
  - *Your turn:* top bar + Draft buttons light up; eligible rows show enabled Draft; subtle "It's your pick" emphasis. Timer in normal/urgent state.
  - *Not your turn:* Draft buttons hidden or shown disabled with "Sam is picking"; list still fully searchable/filterable (planning ahead). Timer still visible.
  - *Ineligible row:* greyed, no Draft button, reason chip ("FWD full", "Max 🇧🇷", "Would break GK minimum").
  - *Loading / connecting:* skeleton rows + "Connecting to draft…"; on connect, full snapshot replaces skeleton.
  - *Live (someone else picks):* the picked player vanishes from the list, feed gets a new line, toast "Mara drafted 🇫🇷 MID Tchouaméni", clock moves to next person.
  - *Paused (timer expired or admin paused):* prominent banner "Draft paused — waiting for admin" (or, for admin, the in-draft control bar). Timer shows **expired** state. List interactions for picking are suspended.
  - *Empty filter result:* "No available players match your filters" + "Clear filters".
  - *Error:* "Lost connection — reconnecting" banner; picks disabled until snapshot returns.
  - *Complete:* auto-transition to the Complete view.
- **Example content:** Top bar "Round 3 of 9 · Snake · On the clock: Sam · 01:12". A few available rows: 🇧🇷 FWD Vinícius Júnior — Real Madrid [Draft]; 🇪🇸 MID Pedri — Barcelona [Draft]; 🇧🇪 MID Kevin De Bruyne — (greyed) "MID full"; 🇨🇲 GK André Onana — "Max 🇨🇲". Roster (Sam): GK 1/1–2 ✓, DEF 2/3–5, MID 3/3–5 ✓, FWD 1/1–3. Feed: "🇦🇷 FWD Messi — by Erik", "🇲🇦 DEF Hakimi — by Dewi".

### 2.5 Draft complete
- **Purpose:** show the finished draft and make it trivial to copy results into the *other* fantasy platform.
- **Who sees it:** everyone, when `status = complete`.
- **Key elements:** the **final board** (same grid as the tab, now the main view), a per-user results breakdown, and **copy-to-clipboard** controls — "Copy all results" and per-user "Copy" buttons. Copied text is grouped by user, each line `country · POS · player name`.
- **States:** default (board + copy buttons); copy success toast "Copied Erik's squad"; admin also sees a "Start new draft / Reset" affordance (clears participants & picks, keeps players — confirm via modal).
- **Example copied block:**
  ```
  Erik
  Argentina · FWD · Lionel Messi
  Brazil · MID · Bruno Guimarães
  France · DEF · Jules Koundé
  ...
  ```

### 2.6 Admin area (`/admin`)
- **Purpose:** everything an admin controls. Some of it overlaps the lobby (settings) and the live room (in-draft controls); `/admin` is the full console.
- **Who sees it:** admins only. Non-admins hitting the route get a polite "Admins only" state.
- **Sections:**
  - **Settings editor:** same fields as lobby settings; usable while `lobby`. Read-only/locked note once the draft is in progress.
  - **User management:** table of users — name, admin badge, online dot. Actions per row: **Reset password** (to temp password; warns "they'll be logged out and must change it"), **Promote / Demote admin** (multiple admins allowed; guard against demoting the last admin). 
  - **Player CRUD:** searchable/filterable player table (flag · POS · name · club · shirt#). Add / Edit / Disable. **Drafted players can't be deleted** — only **Disable** (`active=0`); show why if blocked.
  - **In-draft controls (live):** a compact control bar — **Pause / Resume**, **Undo last pick** (only most recent; returns the turn with a fresh timer), **Extend timer** (+30s etc.), **Pick on behalf** (opens the available list scoped to the current picker), and **Randomize / Start** (lobby only).
- **States:** default; action confirmations (modals for destructive/irreversible — reset, demote, disable, undo, reset-draft); success/error toasts; disabled controls that don't apply to the current `status` (e.g. Undo greyed when no picks yet, Start greyed when invalid or already started).
- **Example content:** User row — "Mara · online · [Reset password] [Promote]". Player edit — "🇵🇹 FWD Cristiano Ronaldo · Al-Nassr · #7". In-draft bar — "⏸ Pause · ↩ Undo last (🇧🇷 MID Bruno) · +30s · Pick for Sam".

---

## 3. Shared components

Design these once; reuse everywhere. Consistency here carries the whole app.

- **Player / pick row (the core unit):** horizontal `flag chip → position badge → player name` with a secondary club line; optional right-side slot for action (Draft) or meta (round/owner). This same unit appears in: available list, pick feed, roster, board grid (compact), admin player table, copy preview. Define **three densities**: comfortable (list), compact (feed/grid), and inline (toast).
- **Position badge:** small rounded chip, fixed color per position (GK amber / DEF blue / MID green / FWD red-orange), **always with text code**. Consistent size.
- **Country flag chip:** rounded-rect flag from `country_code`; fallback = 3-letter code chip. Labeled for screen readers. Never a bare circle, never empty.
- **Countdown timer:** large tabular numerals `M:SS`. Three states:
  - *Normal* (lots of time): neutral/light, calm.
  - *Urgent* (e.g. ≤10s): accent/red, larger or pulsing, maybe a thin shrinking progress ring/bar.
  - *Expired:* "Time!" / "Paused" state, distinct color, static (no false countdown). Pair with the paused banner.
- **Roster slot meter (fill vs min–max):** per position, shows current count against `min–max`. Three readings: *below min* (needs attention), *within min–max* (good), *at max* (full — that position becomes ineligible). Use filled pips or a small bar + label "MID 3 / 3–5". Color uses position color for identity, plus a state cue (check when min met, lock when at max).
- **Buttons:** primary (Draft / Start / Save — uses accent), secondary (Cancel / Clear filters), destructive (Reset / Disable / Undo — warning color), and disabled (with reason on hover/aria). Draft buttons are the highest-emphasis action in the room and only active on your turn for eligible players.
- **Toasts / live-event notifications:** transient, top or bottom corner, one line, often containing a compact pick unit — "Erik drafted 🇦🇷 FWD Messi". Types: pick made, settings changed, draft started, paused/resumed, undo, your-turn ("You're on the clock — 90s"). Keep them brief and auto-dismiss; never block the timer.
- **Modals:** for confirmations (reset password, demote admin, disable/undo, reset draft) and for **pick-on-behalf** (scoped available list). Always state the consequence and offer a clear Cancel.
- **Banners (full-width inline):** connection ("Reconnecting…"), paused ("Draft paused — waiting for admin"), forced-password, admins-only.

---

## 4. Responsive behavior (draft room specifically)

List-centric was chosen largely so the room works on phones. Design **mobile-first for the list**, then expand to desktop.

- **Desktop (≥ ~1024px):** three regions side by side — main available-players list (largest), right rail split between **your roster** (top) and **live pick feed** (bottom). Top bar spans full width, timer prominent on the right. Board grid is a tab that takes over the main area when active.
- **Tablet (~768–1024px):** roster + feed collapse into a **right drawer** or move to **tabs** beside the list; top bar stays. Board grid still a tab.
- **Phone (< ~768px):**
  - Top bar shrinks but **timer + who's-on-the-clock stay pinned and prominent** (sticky). This is the one thing that must never scroll away.
  - Main view = the **available-players list** full width. Search + filters collapse into a sticky filter bar / a "Filters" sheet (bottom drawer with country, position pills, sort).
  - **Roster** and **pick feed** become **tabs or bottom-drawer panels** (e.g. a segmented control: "Players · My roster · Feed · Board"). Default to Players.
  - **Board grid** is a tab; on phone it scrolls horizontally (it's inherently wide) — make it pannable with sticky user/round headers.
  - Draft buttons remain large/tappable; on your turn, consider a sticky "It's your pick" affordance so the user notices even while scrolled.
- **What collapses, summary:** roster + feed → drawer/tabs; filters → sheet; board → horizontal-scroll tab. **What never collapses:** the timer and "on the clock" indicator.

---

## 5. Microcopy

Keep it short, human, sports-flavored but clear.

- **Buttons/labels:** "Create account", "Log in", "Draft", "Randomize order", "Start draft", "Pause", "Resume", "Undo last pick", "+30s", "Pick for Sam", "Copy all results", "Clear filters", "Start new draft".
- **Lobby/status:** "Waiting for players… (3 of 4–8)", "On the clock: Sam", "You're on the clock", "Sam is picking", "Draft paused — waiting for admin", "Reconnecting…".
- **Empty states:** Available list — "No available players match your filters" / "Clear filters". Feed — "No picks yet — the draft is about to begin." Roster — "No players drafted yet."
- **Eligibility reasons (ineligible rows):**
  - "FWD full" (position already at `pos_max`).
  - "Max 🇧🇷" (already at `max_per_country` for that nation).
  - "Would leave GK minimum unreachable" (forward-feasibility: taking this leaves too few picks to meet a `pos_min`).
  - Generic fallback: "Not eligible for your roster".
- **Validation warnings (lobby):** "Can't start: total picks (5) is below required minimums (6).", "GK min (2) can't exceed GK max (1).", "Max per country must be at least 1.", "Total picks (12) exceeds total maximums (10)."
- **Live-event toasts:**
  - Pick: "Erik drafted 🇦🇷 FWD Messi."
  - Your turn: "You're on the clock — 90 seconds."
  - Timer expiring: "10 seconds left."
  - Paused: "Time! Draft paused for the admin."
  - Resumed: "Draft resumed — Sam is on the clock."
  - Undo: "Admin undid the last pick (🇧🇷 MID Bruno) — back to Erik."
  - Settings: "Admin set the pick timer to 90s."
  - Copy: "Copied Erik's squad to clipboard."
- **Confirmations:** "Reset Mara's password? They'll be logged out and must set a new one.", "Undo Erik's last pick? It returns to them with a fresh timer.", "Start a new draft? This clears all picks and participants (players are kept)."

---

## 6. What to design first (priority order)

1. **The player/pick row + position badge + flag chip** — the atomic unit; everything reuses it. Lock the `flag → position → name` look and the position colors here.
2. **The live draft room — desktop, "your turn" state** — the centerpiece: top bar with the big timer, available list with filters and Draft buttons, roster meter, pick feed. Get this one screen right and the app's identity is set.
3. **The countdown timer states** (normal / urgent / expired) — small but defines the urgency/energy of the whole product.
4. **The live draft room — phone layout** — list full-width, sticky timer, roster/feed/board as tabs/drawer. This validates the responsive choice.
5. **Lobby** — admin editable settings + participant list + read-only participant view, with validation warnings.
6. **Draft complete** — final board + copy-to-clipboard.
7. **Admin area** — settings, user management, player CRUD, in-draft control bar.
8. **Auth screens** — register / login / forced change-password (simple, do last).

Design **dark mode first** (Option A). If time allows, a light variant of the same components.
