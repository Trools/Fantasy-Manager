# Admin Console & Lobby Settings — Design

**Date:** 2026-06-10
**Status:** Approved (design), pending implementation plan
**Scope:** Wire the existing `/api/admin/*` backend to a fully functional Admin console and shared Lobby/Admin settings editor.

## Problem

The backend (`src/worker/routes/admin.ts`) fully implements admin functionality — settings update, draft controls, user management, reset — but the frontend never wired to it. `AdminPage.tsx` is a static placeholder ("Settings editor coming soon. Use API directly for now."), and `LobbyView.tsx` shows settings read-only only. The draft cannot be configured or controlled from the UI.

## Goals

- An editable **Draft Settings** editor, shared between the Lobby (for admins, pre-draft) and the Admin console.
- Full **draft controls**: randomize order, start, pause/resume, undo, +30s, reset.
- **User management**: list users, promote/demote admin, reset password.
- All driven by live WebSocket state; no new backend work.

## Non-goals

- Player CRUD / roster editing (the Admin Console mockup shows a Players tab — out of scope for this iteration).
- Pick-on-behalf UI (endpoint exists; deferred).
- Any backend changes (the API contract is fixed and complete).

## Key architectural decision

The `/admin` route is **not** currently wrapped in `DraftProvider` (only `/` is), and there is **no `GET /admin/settings`** endpoint — settings arrive only via the WebSocket `state` snapshot. Therefore:

**Wrap `/admin` in `DraftProvider`** so AdminPage reads `settings`/`status`/`participants` from the same live `useDraft()` state as the Lobby. After any admin action the backend calls `callDO("refresh")`, which broadcasts a fresh `state` message — so the UI updates automatically with no manual refetch. (Rejected alternative: add REST GET endpoints + manual refetch — duplicates the source of truth and adds backend work.)

## Components

### 1. Client API layer — extend `src/client/utils/api.ts`
Thin wrappers over the existing private `request()` helper, hitting already-built endpoints:
- `updateSettings(payload)` → `PUT /admin/settings`
- `randomizeOrder()` → `POST /admin/randomize`
- `startDraft()` → `POST /admin/start`
- `pauseDraft()` / `resumeDraft()` → `POST /admin/pause` | `/admin/resume`
- `extendTimer(seconds)` → `POST /admin/extend`
- `undoPick()` → `POST /admin/undo`
- `resetDraft()` → `POST /admin/reset-draft`
- `getUsers()` → `GET /admin/users` → `{ users: AdminUser[] }`
- `promoteUser(id)` / `demoteUser(id)` → `POST /admin/users/:id/promote` | `/demote`
- `resetUserPassword(id)` → `POST /admin/users/:id/reset-password` → `{ temp_password }`

`AdminUser` type: `{ id: number; username: string; is_admin: boolean }` (add to `src/shared/types.ts`).

### 2. New components under `src/client/components/admin/`

**`DraftSettings.tsx`** — props `{ editable: boolean }`. Reads `state.settings`/`state.status` from `useDraft()`.
- Editable mode: stepper inputs for `total_picks`, `seconds_per_pick` (min 5), `max_per_country`; a GK/DEF/MID/FWD min/max grid; a snake/linear segmented toggle; a Save button.
- Local form state seeded from `state.settings`, re-seeded when it changes (and not mid-edit).
- Client validation via shared `validateSettings()` + `seconds_per_pick >= 5`; disable Save / show inline messages on invalid. Server is final authority — surface `ApiError.message` on failure; show success feedback on 200.
- Read-only mode (non-admin, or `status !== "lobby"`): summary display + "🔒 Settings lock once the draft starts" note.

**`DraftControls.tsx`** — admin actions, status-aware from `state.status`:
- `lobby`: Randomize Order; Start Draft (disabled until an order exists: `participants.length > 0 && participants.every(p => p.draft_order != null)`).
- `in_progress` / `paused`: Pause/Resume (toggle by status), Undo Last Pick, +30s.
- always: Reset Draft (destructive).
- Each button: local loading + inline error. Destructive actions confirm via native `window.confirm()`.

**`UserManagement.tsx`** — loads `getUsers()` on mount; lists users with:
- Promote/Demote toggle (demote of last admin is server-guarded → surfaced as inline error; native `confirm()` before demote).
- Reset Password → reveals returned `temp_password` inline.
- Refetches the list after each mutation.

### 3. Wiring
- `AdminPage.tsx`: rewritten to compose `DraftSettings` (editable when `status === "lobby"`) + `DraftControls` + `UserManagement`, styled per the existing Admin Console design. Reads `useDraft()` + `useAuth()`.
- `LobbyView.tsx`: render `DraftSettings editable={isAdmin && status === "lobby"}` and, for admins, `DraftControls` — replacing the current read-only-only settings panel.
- `App.tsx`: wrap the `/admin` route element in `<DraftProvider>`.

## Pure helpers (unit-tested)
- `canStartDraft(state): boolean` — order-exists + participants check (extract for `DraftControls`).
- A client settings-validation wrapper combining `validateSettings()` + the `seconds_per_pick >= 5` rule, returning `string[]`.

These are pure functions → unit tests (Vitest `node` project). UI components verified via type-check, production build, and live Playwright check with an admin session.

## Error handling
Every action: local `loading` + `error` state. Errors come from `ApiError` (`.message` = server's `error` field). Settings save shows both client validation (pre-submit) and server validation (post-submit) messages. Destructive actions gated by `window.confirm()`.

## Data flow summary
Edit/act → `api.*` REST call → backend validates + mutates D1 + `callDO("refresh")` → DO broadcasts `state` over WS → `useDraft` updates → UI re-renders. User-management list is REST-only (no WS), refetched after each mutation.

## Files touched
- New: `src/client/components/admin/DraftSettings.tsx`, `DraftControls.tsx`, `UserManagement.tsx`; tests for the pure helpers.
- Modified: `src/client/utils/api.ts`, `src/shared/types.ts` (add `AdminUser`), `src/client/pages/AdminPage.tsx`, `src/client/components/LobbyView.tsx`, `src/client/App.tsx`.
- Possibly: a small `src/client/lib/` or co-located module for the pure helpers.
