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
