import { describe, it, expect } from "vitest";
import { normalizePosition, parseCountryHeader } from "../scripts/parse-squads.mjs";

describe("squad parsing helpers", () => {
  it("maps FIFA position codes", () => {
    expect(normalizePosition("GK")).toBe("GK");
    expect(normalizePosition("DF")).toBe("DEF");
    expect(normalizePosition("MF")).toBe("MID");
    expect(normalizePosition("FW")).toBe("FWD");
    expect(normalizePosition("XX")).toBeNull();
  });
  it("parses country header", () => {
    expect(parseCountryHeader("Algeria (ALG)")).toEqual({ country: "Algeria", country_code: "ALG" });
    expect(parseCountryHeader("Argentina (ARG)")).toEqual({ country: "Argentina", country_code: "ARG" });
    expect(parseCountryHeader("not a header")).toBeNull();
  });
});
