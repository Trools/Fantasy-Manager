# Admin: Kick User From Lobby — Design

**Date:** 2026-06-10
**Status:** Approved (design)
**Scope:** Let an admin remove a participant from the lobby. The kicked user disappears from the overview and stays out until they deliberately reconnect.

## Problem

There is no way for an admin to remove a participant from the lobby. Primary need: clearing out a test user. A naive "delete the participant row" does not work because participants auto-rejoin in three places, all via `INSERT OR IGNORE INTO participants`:

- WebSocket connect (auto-join) — `draft-room.ts` `handleWs`
- `refresh` command re-registers every still-connected socket — `draft-room.ts` `handleCommand` `case "refresh"`
- `POST /participants/join`

Additionally, the client auto-reconnects 2s after any disconnect (`useDraft.tsx` `onclose`). So even closing the kicked user's socket lets them silently reconnect and auto-rejoin within ~2 seconds.

## Goal

Admin kicks a participant → they vanish from everyone's lobby overview and remain gone until they take a deliberate action ("Rejoin" / reload), at which point auto-join naturally re-adds them.

## Non-goals

- Persistent ban across draft resets (YAGNI — kick is per-session).
- Soft "benched" placeholder (explicitly rejected: the user should disappear entirely).
- Kicking outside the lobby (only meaningful pre-draft).

## Design

**WebSocket protocol** — add `{ t: "kicked" }` to `ServerMsg` in `src/shared/types.ts`.

**Durable Object** (`src/worker/draft-room.ts`, new `kick` case in `handleCommand`). Admin is already enforced for every non-`refresh` command.
- Lobby only → else `409`.
- `targetId = Number(body.user_id)`; if `targetId === claims.userId` → `400` (can't kick yourself).
- `DELETE FROM participants WHERE user_id = targetId` — removes them from the overview.
- For each socket whose attachment `userId === targetId`: send `{ t: "kicked" }`, then `ws.close()`.
- `cache = undefined`; `broadcast` fresh state to remaining sockets.
- Because the kicked socket is closed before the broadcast, and this command (not `refresh`) does no re-registration, the row stays gone.

**Backend route** (`src/worker/routes/admin.ts`): `POST /admin/participants/:id/kick`, `requireAuth` + `requireAdmin`, proxies to DO `kick` with `{ user_id: id }` and relays the response (mirrors `randomize`/`start`).

**Client API** (`src/client/utils/api.ts`): `kickParticipant(id: number)`.

**Client `useDraft`** (`src/client/hooks/useDraft.tsx`):
- New `kickedRef` flag + `kicked` state.
- On `{ t: "kicked" }`: set `kickedRef`/`kicked`.
- `onclose`: if `kickedRef` is set, do **not** schedule the reconnect.
- Expose `kicked` and `rejoin()` — clears the flag/state and reconnects the socket.

**Kicked user's UI**: when `kicked`, the draft area shows a centered notice "You were removed from the lobby" with a **Rejoin** button calling `rejoin()`.

**Admin UI** (`src/client/components/LobbyView.tsx`): a small **Kick** (×) control on each participant row, shown when `isAdmin && status === "lobby" && p.user_id !== user.id`, guarded by `window.confirm`.

## Tests

Extend `test/admin.integration.test.ts`:
- Admin kicks a joined participant → participant row gone; excluded from randomize.
- Non-admin kick → `403`.
- Kick outside the lobby → `409`.
- Self-kick → `400`.
