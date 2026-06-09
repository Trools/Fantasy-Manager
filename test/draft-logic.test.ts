import { describe, it, expect } from "vitest";
import { pickerForPickNo, roundForPickNo, eligibility, validateSettings, isDraftComplete } from "../src/shared/draft-logic";

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
  total_picks: 5, seconds_per_pick: 60,
  pos_min: { GK: 1, DEF: 2, MID: 1, FWD: 0 } as any,
  pos_max: { GK: 1, DEF: 3, MID: 3, FWD: 3 } as any,
  max_per_country: 2, order_mode: "snake" as const,
};
describe("eligibility", () => {
  it("blocks a position already at max", () => {
    const roster = [{ position: "GK", country_code: "FRA" }] as any;
    const r = eligibility("GK", "ENG", roster, settings);
    expect(r.ok).toBe(false); expect(r.reason).toBe("GK full");
  });
  it("blocks a country already at cap", () => {
    const roster = [{ position: "DEF", country_code: "BRA" }, { position: "MID", country_code: "BRA" }] as any;
    const r = eligibility("FWD", "BRA", roster, settings);
    expect(r.ok).toBe(false); expect(r.reason).toBe("Max from BRA");
  });
  it("blocks a pick that makes remaining minimums unreachable", () => {
    const roster = [
      { position: "FWD", country_code: "A" }, { position: "FWD", country_code: "B" },
      { position: "FWD", country_code: "C" }, { position: "DEF", country_code: "D" },
    ] as any;
    const r = eligibility("MID", "E", roster, settings);
    expect(r.ok).toBe(false); expect(r.reason).toBe("would leave minimums unreachable");
  });
  it("allows a valid pick", () => {
    const roster = [{ position: "GK", country_code: "A" }] as any;
    expect(eligibility("DEF", "B", roster, settings).ok).toBe(true);
  });
});

describe("settings validation", () => {
  it("rejects total_picks below sum of minimums", () => {
    const errs = validateSettings({ total_picks: 3, pos_min: { GK:1,DEF:3,MID:1,FWD:1 }, pos_max:{GK:1,DEF:3,MID:3,FWD:3}, max_per_country:2 } as any);
    expect(errs).toContain("total_picks must be at least the sum of minimums (6)");
  });
  it("rejects total_picks above sum of maximums", () => {
    const errs = validateSettings({ total_picks: 99, pos_min:{GK:0,DEF:0,MID:0,FWD:0}, pos_max:{GK:1,DEF:1,MID:1,FWD:1}, max_per_country:2 } as any);
    expect(errs.some(e => e.includes("at most the sum of maximums"))).toBe(true);
  });
  it("accepts valid settings", () => {
    expect(validateSettings({ total_picks: 6, pos_min:{GK:1,DEF:2,MID:1,FWD:0}, pos_max:{GK:2,DEF:4,MID:4,FWD:4}, max_per_country:2 } as any)).toEqual([]);
  });
});

describe("completion", () => {
  it("is complete when all participants reached total_picks", () => {
    expect(isDraftComplete(8, [1,2], 4)).toBe(true);
    expect(isDraftComplete(7, [1,2], 4)).toBe(false);
  });
});
