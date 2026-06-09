import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, signSession, verifySession } from "../src/shared/crypto";

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const { hash, salt } = await hashPassword("hunter2");
    expect(await verifyPassword("hunter2", hash, salt)).toBe(true);
    expect(await verifyPassword("nope", hash, salt)).toBe(false);
  });
});
describe("session cookie", () => {
  const claims = { userId: 1, username: "erik", isAdmin: true, mustChangePwd: false, tokenVersion: 0, iat: 1000 };
  it("round-trips signed claims", async () => {
    const token = await signSession(claims, "secret");
    expect(await verifySession(token, "secret")).toEqual(claims);
  });
  it("rejects tampered or wrong-secret tokens", async () => {
    const token = await signSession(claims, "secret");
    expect(await verifySession(token, "other")).toBeNull();
    expect(await verifySession(token.slice(0, -2) + "xx", "secret")).toBeNull();
  });
});
