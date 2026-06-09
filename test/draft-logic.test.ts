import { describe, it, expect } from "vitest";
import { pickerForPickNo, roundForPickNo } from "../src/shared/draft-logic";

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
