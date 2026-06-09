import { describe, it, expect } from "vitest";
import { pickerForPickNo, roundForPickNo, eligibility } from "../src/shared/draft-logic";

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
