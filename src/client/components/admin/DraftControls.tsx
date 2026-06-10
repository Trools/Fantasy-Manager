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
