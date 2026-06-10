import { describe, it, expect } from "vitest";
import { pickerForPickNo, roundForPickNo, eligibility, validateSettings, isDraftComplete, rosterFromPicks, sumPosCount } from "../src/shared/draft-logic";
import type { Player, Pick } from "../src/shared/types";

describe("snake order", () => {
  const order = [10, 20, 30]; // user ids in draft_order
  it("round 1 goes forward", () => {
    expect(pickerForPickNo(1, order, "snake")).toBe(10);
    expect(pickerForPickNo(3, order, "snake")).toBe(30);
  });
  it("round 2 reverses", () => {
    expect(pickerForPickNo(4, order, "snake")).toBe(30);
    expect(pickerForPickNo(6, order, "snake")).toBe(10);
  });
  it("round 3 forward again", () => {
    expect(pickerForPickNo(7, order, "snake")).toBe(10);
  });
  it("linear never reverses", () => {
    expect(pickerForPickNo(4, order, "linear")).toBe(10);
    expect(pickerForPickNo(6, order, "linear")).toBe(30);
  });
  it("computes round number", () => {
    expect(roundForPickNo(1, 3)).toBe(1);
    expect(roundForPickNo(4, 3)).toBe(2);
  });
});

const settings = {
  pos_count: { GK: 1, DEF: 3, MID: 3, FWD: 3 } as const,
  max_per_country: 2,
};
describe("eligibility", () => {
  it("blocks a position already at its exact count", () => {
    const roster = [{ position: "GK", country_code: "FRA" }] as any;
    const r = eligibility("GK", "ENG", roster, settings);
    expect(r.ok).toBe(false); expect(r.reason).toBe("GK full");
  });
  it("blocks a country already at cap", () => {
    const roster = [{ position: "DEF", country_code: "BRA" }, { position: "MID", country_code: "BRA" }] as any;
    const r = eligibility("FWD", "BRA", roster, settings);
    expect(r.ok).toBe(false); expect(r.reason).toBe("Max from BRA");
  });
  it("allows filling a position up to its exact count", () => {
    const roster = [{ position: "DEF", country_code: "A" }, { position: "DEF", country_code: "B" }] as any;
    expect(eligibility("DEF", "C", roster, settings).ok).toBe(true); // 2 of 3 DEF, room for one more
  });
  it("allows a valid pick", () => {
    const roster = [{ position: "GK", country_code: "A" }] as any;
    expect(eligibility("DEF", "B", roster, settings).ok).toBe(true);
  });
});

describe("sumPosCount", () => {
  it("sums the four position counts into the squad size", () => {
    expect(sumPosCount({ GK: 1, DEF: 4, MID: 4, FWD: 2 })).toBe(11);
  });
});

describe("settings validation", () => {
  it("rejects a negative position count", () => {
    const errs = validateSettings({ pos_count: { GK: -1, DEF: 4, MID: 4, FWD: 2 }, max_per_country: 2 } as any);
    expect(errs.some(e => /GK count/.test(e))).toBe(true);
  });
  it("rejects an empty squad", () => {
    const errs = validateSettings({ pos_count: { GK: 0, DEF: 0, MID: 0, FWD: 0 }, max_per_country: 2 });
    expect(errs).toContain("squad must have at least 1 player");
  });
  it("rejects max_per_country below 1", () => {
    const errs = validateSettings({ pos_count: { GK: 1, DEF: 4, MID: 4, FWD: 2 }, max_per_country: 0 });
    expect(errs).toContain("max_per_country must be at least 1");
  });
  it("accepts valid settings", () => {
    expect(validateSettings({ pos_count: { GK: 1, DEF: 4, MID: 4, FWD: 2 }, max_per_country: 3 })).toEqual([]);
  });
});

describe("completion", () => {
  it("is complete when all participants reached total_picks", () => {
    expect(isDraftComplete(8, [1,2], 4)).toBe(true);
    expect(isDraftComplete(7, [1,2], 4)).toBe(false);
  });
});

describe("rosterFromPicks", () => {
  it("returns only entries for the requested user, in pick order", () => {
    const playerMap = new Map<number, Player>([
      [101, { id: 101, country: "France", country_code: "FRA", position: "GK", shirt_number: 1, full_name: "Hugo Lloris", name_on_shirt: "LLORIS", club: "Spurs", dob: "1986-12-26", active: true }],
      [102, { id: 102, country: "Brazil", country_code: "BRA", position: "DEF", shirt_number: 3, full_name: "Marquinhos", name_on_shirt: "MARQUINHOS", club: "PSG", dob: "1994-05-14", active: true }],
      [103, { id: 103, country: "England", country_code: "ENG", position: "MID", shirt_number: 8, full_name: "Declan Rice", name_on_shirt: "RICE", club: "Arsenal", dob: "1999-01-14", active: true }],
    ]);

    const picks: Pick[] = [
      { overall_no: 1, round_no: 1, user_id: 1, player_id: 101, picked_by_user_id: 1, picked_at: 1000 },
      { overall_no: 2, round_no: 1, user_id: 2, player_id: 102, picked_by_user_id: 2, picked_at: 1001 },
      { overall_no: 3, round_no: 2, user_id: 1, player_id: 103, picked_by_user_id: 1, picked_at: 1002 },
    ];

    const roster = rosterFromPicks(picks, playerMap, 1);

    expect(roster).toHaveLength(2);
    expect(roster[0]).toEqual({ position: "GK", country_code: "FRA" });
    expect(roster[1]).toEqual({ position: "MID", country_code: "ENG" });
  });
});
