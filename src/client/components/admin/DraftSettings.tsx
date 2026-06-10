import { useEffect, useState } from "react";
import { useDraft } from "../../hooks/useDraft";
import * as api from "../../utils/api";
import { ApiError } from "../../utils/api";
import { validateSettingsClient } from "../../lib/admin-helpers";
import { sumPosCount } from "../../../shared/draft-logic";
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
  const updatePos = (pos: Position, n: number) =>
    update({ pos_count: { ...form.pos_count, [pos]: n } });
  const squadSize = sumPosCount(s.pos_count);

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
          <div className={label}>Squad size</div>
          <div className="text-center text-2xl font-black tabular-nums text-(color:--color-text-primary)">{squadSize}</div>
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

      {/* Exact players-per-position grid */}
      <div className="mb-[18px] rounded-[13px] border border-white/[0.06] bg-white/[0.02] px-4 py-1.5">
        <div className="grid grid-cols-2 gap-2.5 border-b border-white/[0.06] pb-2.5 pt-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-(color:--color-text-muted)">Position</span>
          <span className="text-center text-[10px] font-bold uppercase tracking-[0.1em] text-(color:--color-text-muted)">Players</span>
        </div>
        {POSITIONS.map((pos) => {
          const st = POS_STYLE[pos];
          return (
            <div key={pos} className="grid grid-cols-2 items-center gap-2.5 border-b border-white/[0.04] py-[9px]">
              <span className="justify-self-start rounded-[7px] px-2 py-[5px] text-xs font-extrabold tracking-[0.05em]"
                style={{ background: st.bg, color: st.fg, border: `1px solid ${st.bd}` }}>{pos}</span>
              {editable
                ? <div className="flex justify-center"><Stepper value={s.pos_count[pos]} min={0} max={11} onChange={(n) => updatePos(pos, n)} /></div>
                : <span className="text-center text-[15px] font-extrabold tabular-nums text-(color:--color-text-primary)">{s.pos_count[pos]}</span>}
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
