# Admin Console & Lobby Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-built `/api/admin/*` backend to a fully functional Admin console plus a shared, editable Draft Settings editor used in both the Lobby and Admin pages.

**Architecture:** A thin client API layer (`api.ts`) calls the existing REST endpoints; after each mutation the backend broadcasts fresh state over the existing WebSocket, so UI updates automatically via `useDraft()`. The `/admin` route gets wrapped in `DraftProvider` so it shares that live state. Three new components (`DraftSettings`, `DraftControls`, `UserManagement`) compose into AdminPage; `DraftSettings` + `DraftControls` also render in the Lobby for admins. Pure helpers are unit-tested; components are verified by type-check, build, and a live Playwright pass.

**Tech Stack:** React 19 + react-router-dom 7, Vite, Tailwind v4 (CSS-variable utilities: `bg-(--color-x)`, `text-(color:--color-x)`), Hono worker, Vitest (`node` + `workers` projects).

**Spec:** `docs/superpowers/specs/2026-06-10-admin-lobby-settings-design.md`

**Conventions:** Tailwind v4 syntax only. Confirm destructive actions with `window.confirm()`. Commit after each task.

---

### Task 1: Types + client API layer

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/client/utils/api.ts`

- [ ] **Step 1: Add the `AdminUser` type**

In `src/shared/types.ts`, after the `PublicUser` interface, add:

```ts
export interface AdminUser { id: number; username: string; is_admin: boolean; }
```

- [ ] **Step 2: Add admin API functions**

In `src/client/utils/api.ts`, update the top import to include `Settings` and `AdminUser`:

```ts
import type { MeResponse, Player, PublicUser, ErrorResponse, Settings, AdminUser } from "../../shared/types";
```

Then add these functions just above the final `export { ApiError };` line:

```ts
// Admin endpoints (all require an admin session; backend enforces).
export async function updateSettings(settings: Settings): Promise<void> {
  return request("/admin/settings", { method: "PUT", body: JSON.stringify(settings) });
}
export async function randomizeOrder(): Promise<void> {
  return request("/admin/randomize", { method: "POST" });
}
export async function startDraft(): Promise<void> {
  return request("/admin/start", { method: "POST" });
}
export async function pauseDraft(): Promise<void> {
  return request("/admin/pause", { method: "POST" });
}
export async function resumeDraft(): Promise<void> {
  return request("/admin/resume", { method: "POST" });
}
export async function extendTimer(seconds: number): Promise<void> {
  return request("/admin/extend", { method: "POST", body: JSON.stringify({ seconds }) });
}
export async function undoPick(): Promise<void> {
  return request("/admin/undo", { method: "POST" });
}
export async function resetDraft(): Promise<void> {
  return request("/admin/reset-draft", { method: "POST" });
}
export async function getUsers(): Promise<AdminUser[]> {
  const data = await request<{ users: AdminUser[] }>("/admin/users");
  return data.users;
}
export async function promoteUser(id: number): Promise<void> {
  return request(`/admin/users/${id}/promote`, { method: "POST" });
}
export async function demoteUser(id: number): Promise<void> {
  return request(`/admin/users/${id}/demote`, { method: "POST" });
}
export async function resetUserPassword(id: number): Promise<{ temp_password: string }> {
  return request(`/admin/users/${id}/reset-password`, { method: "POST" });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/client/utils/api.ts
git commit -m "feat: client API layer for admin endpoints + AdminUser type"
```

---

### Task 2: Pure helpers + unit tests (TDD)

**Files:**
- Create: `src/client/lib/admin-helpers.ts`
- Create: `test/admin-helpers.test.ts`
- Modify: `vitest.config.ts` (register the new test in the `node` project `include` list)

- [ ] **Step 1: Register the test file in the node project**

In `vitest.config.ts`, change the `node` project's `include` array to add the new file:

```ts
            include: [
              "test/draft-logic.test.ts",
              "test/crypto.test.ts",
              "test/parse-squads.test.ts",
              "test/admin-helpers.test.ts",
            ],
```

- [ ] **Step 2: Write the failing test**

Create `test/admin-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canStartDraft, validateSettingsClient } from "../src/client/lib/admin-helpers";
import type { DraftState, Settings } from "../src/shared/types";

const baseSettings: Settings = {
  total_picks: 9,
  seconds_per_pick: 60,
  pos_min: { GK: 1, DEF: 2, MID: 2, FWD: 1 },
  pos_max: { GK: 2, DEF: 5, MID: 5, FWD: 3 },
  max_per_country: 3,
  order_mode: "snake",
};

function stateWith(partial: Partial<DraftState>): DraftState {
  return {
    status: "lobby",
    settings: baseSettings,
    participants: [],
    picks: [],
    current_pick_no: null,
    current_user_id: null,
    timer_deadline: null,
    round_no: null,
    ...partial,
  };
}

describe("canStartDraft", () => {
  it("false for null state", () => {
    expect(canStartDraft(null)).toBe(false);
  });
  it("false when not in lobby", () => {
    expect(canStartDraft(stateWith({ status: "in_progress" }))).toBe(false);
  });
  it("false with fewer than 2 participants", () => {
    expect(
      canStartDraft(stateWith({ participants: [{ user_id: 1, username: "a", draft_order: 1, joined: true }] }))
    ).toBe(false);
  });
  it("false when any participant has no draft_order", () => {
    expect(
      canStartDraft(
        stateWith({
          participants: [
            { user_id: 1, username: "a", draft_order: 1, joined: true },
            { user_id: 2, username: "b", draft_order: null, joined: true },
          ],
        })
      )
    ).toBe(false);
  });
  it("true when lobby, >=2 participants, all ordered", () => {
    expect(
      canStartDraft(
        stateWith({
          participants: [
            { user_id: 1, username: "a", draft_order: 1, joined: true },
            { user_id: 2, username: "b", draft_order: 2, joined: true },
          ],
        })
      )
    ).toBe(true);
  });
});

describe("validateSettingsClient", () => {
  it("returns [] for valid settings", () => {
    expect(validateSettingsClient(baseSettings)).toEqual([]);
  });
  it("flags a sub-5s pick timer", () => {
    expect(validateSettingsClient({ ...baseSettings, seconds_per_pick: 3 })).toContain(
      "Pick timer must be at least 5 seconds"
    );
  });
  it("flags total_picks below the sum of minimums", () => {
    const errs = validateSettingsClient({ ...baseSettings, total_picks: 2 });
    expect(errs.some((e) => /sum of minimums/.test(e))).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test, verify it FAILS**

Run: `npx vitest run --project node test/admin-helpers.test.ts`
Expected: FAIL — cannot resolve `../src/client/lib/admin-helpers`.

- [ ] **Step 4: Implement the helpers**

Create `src/client/lib/admin-helpers.ts`:

```ts
import type { DraftState, Settings } from "../../shared/types";
import { validateSettings } from "../../shared/draft-logic";

/** True when the draft can be started: in lobby, >=2 participants, all with a draft_order. */
export function canStartDraft(state: DraftState | null): boolean {
  if (!state || state.status !== "lobby") return false;
  const ps = state.participants;
  if (ps.length < 2) return false;
  return ps.every((p) => p.draft_order !== null);
}

/** Client-side settings validation: shared roster rules + timer/rounds floors. Returns [] when valid. */
export function validateSettingsClient(s: Settings): string[] {
  const errs = validateSettings(s);
  if (!Number.isInteger(s.total_picks) || s.total_picks < 1) {
    errs.push("Rounds must be a positive whole number");
  }
  if (!Number.isInteger(s.seconds_per_pick) || s.seconds_per_pick < 5) {
    errs.push("Pick timer must be at least 5 seconds");
  }
  return errs;
}
```

- [ ] **Step 5: Run the test, verify it PASSES**

Run: `npx vitest run --project node test/admin-helpers.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/client/lib/admin-helpers.ts test/admin-helpers.test.ts vitest.config.ts
git commit -m "feat: admin helper functions (canStartDraft, validateSettingsClient) + tests"
```

---

### Task 3: DraftSettings component (shared, editable/read-only)

**Files:**
- Create: `src/client/components/admin/DraftSettings.tsx`

- [ ] **Step 1: Create the component**

Create `src/client/components/admin/DraftSettings.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useDraft } from "../../hooks/useDraft";
import * as api from "../../utils/api";
import { ApiError } from "../../utils/api";
import { validateSettingsClient } from "../../lib/admin-helpers";
import type { Settings, Position } from "../../../shared/types";

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
const POS_STYLE: Record<Position, { fg: string; bg: string; bd: string }> = {
  GK: { fg: "#FBBF24", bg: "rgba(251,191,36,0.16)", bd: "rgba(251,191,36,0.45)" },
  DEF: { fg: "#6AA8FF", bg: "rgba(59,130,246,0.16)", bd: "rgba(59,130,246,0.45)" },
  MID: { fg: "#34D399", bg: "rgba(16,185,129,0.16)", bd: "rgba(16,185,129,0.45)" },
  FWD: { fg: "#FB8359", bg: "rgba(244,96,46,0.18)", bd: "rgba(244,96,46,0.5)" },
};

function Stepper({
  value, onChange, min = 0, max = 99, step = 1, suffix,
}: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)));
  return (
    <div className="inline-flex items-center gap-1.5">
      <button type="button" onClick={() => set(value - step)} disabled={value <= min}
        className="h-7 w-7 rounded-[8px] border border-white/10 bg-white/5 text-base font-black leading-none text-(color:--color-text-primary) disabled:opacity-40">−</button>
      <span className="min-w-[2.75rem] text-center text-[15px] font-black tabular-nums text-(color:--color-text-primary)">{value}{suffix}</span>
      <button type="button" onClick={() => set(value + step)} disabled={value >= max}
        className="h-7 w-7 rounded-[8px] border border-white/10 bg-white/5 text-base font-black leading-none text-(color:--color-text-primary) disabled:opacity-40">+</button>
    </div>
  );
}

const tile = "rounded-[13px] border border-white/[0.06] bg-white/[0.02] p-3.5";
const label = "mb-2.5 text-[11px] font-bold text-(color:--color-text-secondary)";

export default function DraftSettings({ editable }: { editable: boolean }) {
  const { state } = useDraft();
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed the form from live settings. When read-only, always mirror live state.
  // When editable, seed once (don't clobber an in-progress edit on every broadcast).
  useEffect(() => {
    if (!state?.settings) return;
    if (!editable) setForm(state.settings);
    else setForm((prev) => prev ?? state.settings);
  }, [state?.settings, editable]);

  if (!state || !form) return null;
  const s = editable ? form : state.settings;
  const clientErrors = editable ? validateSettingsClient(form) : [];

  const update = (patch: Partial<Settings>) => {
    setForm({ ...form, ...patch });
    setSaved(false);
    setError(null);
  };
  const updatePos = (key: "pos_min" | "pos_max", pos: Position, n: number) =>
    update({ [key]: { ...form[key], [pos]: n } } as Partial<Settings>);

  async function save() {
    if (clientErrors.length) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateSettings(form!);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-[18px] grid grid-cols-3 gap-3.5">
        <div className={tile}>
          <div className={label}>Rounds</div>
          {editable
            ? <div className="flex justify-center"><Stepper value={s.total_picks} min={1} max={30} onChange={(n) => update({ total_picks: n })} /></div>
            : <div className="text-center text-2xl font-black tabular-nums text-(color:--color-text-primary)">{s.total_picks}</div>}
        </div>
        <div className={tile}>
          <div className={label}>Pick timer</div>
          {editable
            ? <div className="flex justify-center"><Stepper value={s.seconds_per_pick} min={5} max={300} step={5} suffix="s" onChange={(n) => update({ seconds_per_pick: n })} /></div>
            : <div className="text-center text-2xl font-black tabular-nums text-(color:--color-text-primary)">{s.seconds_per_pick}s</div>}
        </div>
        <div className={tile}>
          <div className={label}>Max / country</div>
          {editable
            ? <div className="flex justify-center"><Stepper value={s.max_per_country} min={1} max={11} onChange={(n) => update({ max_per_country: n })} /></div>
            : <div className="text-center text-2xl font-black tabular-nums text-(color:--color-text-primary)">{s.max_per_country}</div>}
        </div>
      </div>

      {/* Position min/max grid */}
      <div className="mb-[18px] rounded-[13px] border border-white/[0.06] bg-white/[0.02] px-4 py-1.5">
        <div className="grid grid-cols-3 gap-2.5 border-b border-white/[0.06] pb-2.5 pt-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-(color:--color-text-muted)">Position</span>
          <span className="text-center text-[10px] font-bold uppercase tracking-[0.1em] text-(color:--color-text-muted)">Min</span>
          <span className="text-center text-[10px] font-bold uppercase tracking-[0.1em] text-(color:--color-text-muted)">Max</span>
        </div>
        {POSITIONS.map((pos) => {
          const st = POS_STYLE[pos];
          return (
            <div key={pos} className="grid grid-cols-3 items-center gap-2.5 border-b border-white/[0.04] py-[9px]">
              <span className="justify-self-start rounded-[7px] px-2 py-[5px] text-xs font-extrabold tracking-[0.05em]"
                style={{ background: st.bg, color: st.fg, border: `1px solid ${st.bd}` }}>{pos}</span>
              {editable
                ? <div className="flex justify-center"><Stepper value={s.pos_min[pos]} min={0} max={11} onChange={(n) => updatePos("pos_min", pos, n)} /></div>
                : <span className="text-center text-[15px] font-extrabold tabular-nums text-(color:--color-text-primary)">{s.pos_min[pos]}</span>}
              {editable
                ? <div className="flex justify-center"><Stepper value={s.pos_max[pos]} min={0} max={11} onChange={(n) => updatePos("pos_max", pos, n)} /></div>
                : <span className="text-center text-[15px] font-extrabold tabular-nums text-(color:--color-text-primary)">{s.pos_max[pos]}</span>}
            </div>
          );
        })}
      </div>

      {/* Order mode */}
      <div className={`mb-[18px] ${tile}`}>
        <div className={label}>Order mode</div>
        <div className="flex gap-1.5">
          {(["snake", "linear"] as const).map((mode) => {
            const active = s.order_mode === mode;
            return (
              <button key={mode} type="button" disabled={!editable} onClick={() => editable && update({ order_mode: mode })}
                className="flex-1 rounded-[9px] py-2.5 text-center text-xs font-extrabold capitalize"
                style={{
                  color: active ? "#0A0E16" : "#9AA7B8",
                  background: active ? "#FF3D7F" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${active ? "#FF3D7F" : "rgba(255,255,255,0.08)"}`,
                  cursor: editable ? "pointer" : "default",
                }}>
                {mode === "snake" ? "↩ Snake" : "→ Linear"}
              </button>
            );
          })}
        </div>
      </div>

      {editable ? (
        <>
          {clientErrors.length > 0 && (
            <ul className="mb-3 list-disc rounded-[11px] border border-[rgba(255,90,77,0.3)] bg-[rgba(255,90,77,0.08)] px-6 py-3 text-[12.5px] font-semibold text-[#F4C7C1]">
              {clientErrors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          {error && (
            <div className="mb-3 rounded-[11px] border border-[rgba(255,90,77,0.32)] bg-[rgba(255,90,77,0.08)] px-4 py-3 text-[13px] font-semibold text-[#F4C7C1]">{error}</div>
          )}
          {saved && (
            <div className="mb-3 rounded-[11px] border border-[rgba(52,211,153,0.3)] bg-[rgba(52,211,153,0.07)] px-4 py-3 text-[13px] font-bold text-[#6EE7B7]">✓ Settings saved</div>
          )}
          <button type="button" onClick={save} disabled={saving || clientErrors.length > 0}
            className="w-full rounded-[12px] border-b-[3px] border-(color:--color-accent-hover) bg-(--color-accent-primary) py-3.5 text-sm font-extrabold uppercase tracking-wide text-(color:--color-bg-primary) disabled:opacity-50">
            {saving ? "Saving…" : "Save settings"}
          </button>
        </>
      ) : (
        state.status !== "lobby" && (
          <div className="rounded-[12px] border border-white/[0.07] bg-white/[0.03] px-4 py-[15px] text-center text-[13px] font-bold text-(color:--color-text-secondary)">
            🔒 Settings lock once the draft starts.
          </div>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/client/components/admin/DraftSettings.tsx
git commit -m "feat: shared DraftSettings editor (editable/read-only)"
```

---

### Task 4: DraftControls component

**Files:**
- Create: `src/client/components/admin/DraftControls.tsx`

- [ ] **Step 1: Create the component**

Create `src/client/components/admin/DraftControls.tsx`:

```tsx
import { useState } from "react";
import { useDraft } from "../../hooks/useDraft";
import * as api from "../../utils/api";
import { ApiError } from "../../utils/api";
import { canStartDraft } from "../../lib/admin-helpers";
import Button from "../Button";

export default function DraftControls() {
  const { state } = useDraft();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!state) return null;
  const status = state.status;

  async function run(fn: () => Promise<void>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {status === "lobby" && (
        <>
          <Button className="w-full" variant="secondary" disabled={busy} onClick={() => run(api.randomizeOrder)}>
            Randomize Order
          </Button>
          <Button className="w-full" disabled={busy || !canStartDraft(state)} onClick={() => run(api.startDraft)}>
            Start Draft
          </Button>
          {!canStartDraft(state) && (
            <p className="text-center text-[11px] font-semibold text-(color:--color-text-muted)">
              Need 2+ managers with an order set before starting.
            </p>
          )}
        </>
      )}

      {(status === "in_progress" || status === "paused") && (
        <>
          {status === "in_progress" ? (
            <Button className="w-full" variant="secondary" disabled={busy} onClick={() => run(api.pauseDraft)}>⏸ Pause Draft</Button>
          ) : (
            <Button className="w-full" disabled={busy} onClick={() => run(api.resumeDraft)}>▶ Resume Draft</Button>
          )}
          <Button className="w-full" variant="secondary" disabled={busy} onClick={() => run(api.undoPick, "Undo the last pick?")}>↩ Undo Last Pick</Button>
          <Button className="w-full" variant="secondary" disabled={busy} onClick={() => run(() => api.extendTimer(30))}>＋30 Seconds</Button>
        </>
      )}

      {status !== "lobby" && (
        <div className="border-t border-white/[0.07] pt-3">
          <button type="button" disabled={busy}
            onClick={() => run(api.resetDraft, "Reset the draft? This clears all picks and participants and returns to the lobby.")}
            className="w-full rounded-[12px] border-b-[3px] border-[#B0291F] bg-[#FF5A4D] py-3 text-sm font-extrabold uppercase tracking-wide text-white disabled:opacity-50">
            Reset Draft
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-[11px] border border-[rgba(255,90,77,0.32)] bg-[rgba(255,90,77,0.08)] px-4 py-2.5 text-[12.5px] font-semibold text-[#F4C7C1]">{error}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/client/components/admin/DraftControls.tsx
git commit -m "feat: status-aware DraftControls (randomize/start/pause/resume/undo/+30s/reset)"
```

---

### Task 5: UserManagement component

**Files:**
- Create: `src/client/components/admin/UserManagement.tsx`

- [ ] **Step 1: Create the component**

Create `src/client/components/admin/UserManagement.tsx`:

```tsx
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../hooks/useAuth";
import * as api from "../../utils/api";
import { ApiError } from "../../utils/api";
import type { AdminUser } from "../../../shared/types";

export default function UserManagement() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tempPw, setTempPw] = useState<{ id: number; pw: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api.getUsers());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<void>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    }
  }

  async function resetPw(u: AdminUser) {
    if (!window.confirm(`Reset ${u.username}'s password to the shared temp password?`)) return;
    setError(null);
    try {
      const { temp_password } = await api.resetUserPassword(u.id);
      setTempPw({ id: u.id, pw: temp_password });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    }
  }

  if (loading) {
    return <p className="text-[12.5px] font-semibold text-(color:--color-text-muted)">Loading users…</p>;
  }

  return (
    <div className="space-y-2.5">
      {error && (
        <div className="rounded-[11px] border border-[rgba(255,90,77,0.32)] bg-[rgba(255,90,77,0.08)] px-4 py-2.5 text-[12.5px] font-semibold text-[#F4C7C1]">{error}</div>
      )}
      {users.map((u) => (
        <div key={u.id} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex-1 text-sm font-bold text-(color:--color-text-primary)">
              {u.username}
              {u.is_admin && (
                <span className="ml-2 rounded-[6px] border border-[rgba(255,61,127,0.4)] bg-[rgba(255,61,127,0.12)] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-(color:--color-accent-light)">Admin</span>
              )}
              {me?.id === u.id && (
                <span className="ml-2 text-[10px] font-bold text-(color:--color-text-muted)">(you)</span>
              )}
            </span>
            {u.is_admin ? (
              <button type="button" onClick={() => act(() => api.demoteUser(u.id), `Remove admin from ${u.username}?`)}
                className="rounded-[8px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-(color:--color-text-secondary) hover:text-(color:--color-text-primary)">Demote</button>
            ) : (
              <button type="button" onClick={() => act(() => api.promoteUser(u.id))}
                className="rounded-[8px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-(color:--color-text-secondary) hover:text-(color:--color-text-primary)">Make admin</button>
            )}
            <button type="button" onClick={() => resetPw(u)}
              className="rounded-[8px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-(color:--color-text-secondary) hover:text-(color:--color-text-primary)">Reset pw</button>
          </div>
          {tempPw?.id === u.id && (
            <div className="mt-2 rounded-[8px] border border-[rgba(52,211,153,0.3)] bg-[rgba(52,211,153,0.07)] px-3 py-2 text-[12px] font-bold text-[#6EE7B7]">
              Temp password: <span className="font-mono">{tempPw.pw}</span> — share it; they must change it on next login.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/client/components/admin/UserManagement.tsx
git commit -m "feat: UserManagement (list/promote/demote/reset-password)"
```

---

### Task 6: Wire AdminPage + wrap /admin in DraftProvider

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/client/pages/AdminPage.tsx`

- [ ] **Step 1: Wrap the /admin route in DraftProvider**

In `src/client/App.tsx`, the `/admin` route currently renders `<AdminRoute><AdminPage /></AdminRoute>` inside `<ProtectedRoute>`. Wrap `AdminPage` in `DraftProvider` (already imported at top). Replace the `/admin` `<Route>` element with:

```tsx
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminRoute>
              <DraftProvider>
                <AdminPage />
              </DraftProvider>
            </AdminRoute>
          </ProtectedRoute>
        }
      />
```

- [ ] **Step 2: Rewrite AdminPage to compose the new components**

Replace the body of `src/client/pages/AdminPage.tsx` with:

```tsx
import { Link } from "react-router-dom";
import { useDraft } from "../hooks/useDraft";
import DraftSettings from "../components/admin/DraftSettings";
import DraftControls from "../components/admin/DraftControls";
import UserManagement from "../components/admin/UserManagement";

const card = "rounded-2xl overflow-hidden";
const cardStyle = { background: "#11161F", border: "1px solid rgba(255,255,255,0.07)" } as const;
const headerStyle = { borderBottom: "1px solid rgba(255,255,255,0.07)" } as const;
const headerClass = "font-extrabold text-[11px] leading-none tracking-[0.12em] uppercase text-(color:--color-text-muted)";

const STATUS_LABEL: Record<string, string> = {
  lobby: "In lobby",
  in_progress: "Draft in progress",
  paused: "Draft paused",
  complete: "Draft complete",
};

export default function AdminPage() {
  const { state } = useDraft();
  const status = state?.status ?? "lobby";

  return (
    <div
      className="min-h-screen text-(color:--color-text-primary)"
      style={{
        background: "radial-gradient(1100px 380px at 80% -140px, rgba(255,61,127,0.09), transparent 70%), #0A0E16",
        fontFamily: "Archivo, sans-serif",
      }}
    >
      <div className="max-w-[1140px] mx-auto px-7 pt-6 pb-20">
        {/* App bar */}
        <div className="flex items-center gap-3.5 mb-6">
          <Link to="/" className="inline-flex items-center justify-center w-[42px] h-[42px] rounded-xl font-black text-[14px] leading-none text-white"
            style={{ background: "linear-gradient(140deg,#FF3D7F,#A01F4F)", boxShadow: "0 6px 18px rgba(255,61,127,0.35)" }} aria-label="Back to Draft">WC26</Link>
          <div className="flex-1">
            <div className="font-black text-[22px] leading-none tracking-[-0.01em] text-white">Admin console</div>
            <div className="font-semibold text-xs leading-none text-(color:--color-text-secondary) mt-1">Full control over the draft, users &amp; players</div>
          </div>
          <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full" style={{ background: "rgba(255,61,127,0.10)", border: "1px solid rgba(255,61,127,0.3)" }}>
            <span className="w-2 h-2 rounded-full bg-(--color-accent-primary)" />
            <span className="font-extrabold text-[11px] leading-none tracking-[0.1em] text-(color:--color-accent-light) uppercase">{STATUS_LABEL[status]}</span>
          </span>
        </div>

        <div className="grid gap-[14px] items-start md:grid-cols-2 lg:grid-cols-3">
          {/* Draft Controls */}
          <section className={card} style={cardStyle}>
            <div className="px-5 py-3.5" style={headerStyle}><h2 className={headerClass}>Draft Controls</h2></div>
            <div className="p-5"><DraftControls /></div>
          </section>

          {/* Settings */}
          <section className={card} style={cardStyle}>
            <div className="px-5 py-3.5" style={headerStyle}><h2 className={headerClass}>Draft Settings</h2></div>
            <div className="p-5"><DraftSettings editable={status === "lobby"} /></div>
          </section>

          {/* User Management */}
          <section className={card} style={cardStyle}>
            <div className="px-5 py-3.5" style={headerStyle}><h2 className={headerClass}>User Management</h2></div>
            <div className="p-5"><UserManagement /></div>
          </section>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && npm run build:client`
Expected: exit 0, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/client/App.tsx src/client/pages/AdminPage.tsx
git commit -m "feat: functional AdminPage (settings/controls/users) under DraftProvider"
```

---

### Task 7: Wire DraftSettings + DraftControls into the Lobby

**Files:**
- Modify: `src/client/components/LobbyView.tsx`

- [ ] **Step 1: Replace the read-only settings panel with the shared component**

In `src/client/components/LobbyView.tsx`:

1. Add imports at the top (after the existing imports):

```tsx
import DraftSettings from "./admin/DraftSettings";
import DraftControls from "./admin/DraftControls";
```

2. The component currently destructures `const { settings, participants } = state;` and builds an elaborate read-only settings panel (the second grid column, the `{/* SETTINGS */}` block from `<div className="rounded-[18px] ... px-6 py-[22px]">` through its closing `</div>` before the participants/settings grid closes). Replace that entire **SETTINGS** `<div>` block with:

```tsx
        {/* SETTINGS */}
        <div className="rounded-[18px] border border-white/[0.07] bg-[#11161F] px-6 py-[22px]">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-(color:--color-text-muted)">Draft settings</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#8A97A8]">
              <span className="h-[7px] w-[7px] animate-pulse rounded-full" style={{ background: "#22D3EE" }} />
              {isAdmin ? "Editable · you are admin" : "Live · set by admin"}
            </span>
          </div>
          <p className="m-0 mb-[18px] text-[12.5px] font-medium leading-[1.4] text-(color:--color-text-muted)">
            {isAdmin ? "Configure the draft, then randomize the order and start." : "Current draft setup, kept in sync with the admin."}
          </p>

          <DraftSettings editable={!!isAdmin && state.status === "lobby"} />

          {isAdmin && (
            <div className="mt-[18px] border-t border-white/[0.07] pt-[18px]">
              <DraftControls />
            </div>
          )}
        </div>
```

3. The `settings` destructured variable and the `POS_STYLE`/`POSITIONS`/`tile` references that were only used by the removed read-only panel are now unused. Remove `settings` from the destructure (`const { participants } = state;`) and delete the now-unused `POSITIONS`/`POS_STYLE` constants if `tsc` flags them. Keep `avatarColor`/`AVATAR_COLORS` and the participants panel as-is. Keep `hasOrder` only if still referenced; remove if unused.

- [ ] **Step 2: Type-check — fix any unused-variable errors**

Run: `npx tsc --noEmit`
Expected: exit 0. If it reports unused `settings`, `POSITIONS`, `POS_STYLE`, or `hasOrder`, delete those declarations.

- [ ] **Step 3: Commit**

```bash
git add src/client/components/LobbyView.tsx
git commit -m "feat: editable DraftSettings + DraftControls in Lobby for admins"
```

---

### Task 8: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (existing + the 8 new admin-helper tests).

- [ ] **Step 2: Type-check + production build**

Run: `npx tsc --noEmit && npm run build:client`
Expected: exit 0, build succeeds.

- [ ] **Step 3: Live smoke test (Playwright, optional but recommended)**

Start `npx vite preview --port 4173 --strictPort` won't have a backend; for a real check, run the full dev stack (`npm run dev`) with a logged-in admin, navigate to `/admin`, and confirm: settings steppers change values, Save persists (reload shows new values), Randomize then Start transitions the draft, and User Management lists users. Document what was verified.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore: admin/lobby settings verification cleanup"
```

---

## Self-Review

- **Spec coverage:** API layer (Task 1) ✓; pure helpers + tests (Task 2) ✓; DraftSettings shared editable/read-only (Task 3) ✓; DraftControls status-aware (Task 4) ✓; UserManagement (Task 5) ✓; AdminPage compose + DraftProvider wrap (Task 6) ✓; Lobby wiring (Task 7) ✓; verification (Task 8) ✓. Non-goals (player CRUD, pick-on-behalf) correctly excluded.
- **Type consistency:** `Settings`, `AdminUser`, `Position`, `DraftState` used consistently; `api.updateSettings(Settings)`, `canStartDraft(DraftState|null)`, `validateSettingsClient(Settings)` signatures match across tasks.
- **Placeholders:** none — every code step is complete.
- **Note for executor:** the Lobby edit in Task 7 is a structural replacement; read the current `LobbyView.tsx` SETTINGS block first and let `tsc` guide unused-variable removal.
