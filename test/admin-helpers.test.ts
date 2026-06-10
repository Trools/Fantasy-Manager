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
