import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { countUsers } from "../src/worker/db";

const BASE = "https://example.com";

/** Extract the session cookie (name=value) from a Set-Cookie header. */
function sessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  // Take the part before the first `;` (drops attributes like Path, HttpOnly).
  return setCookie!.split(";")[0]!;
}

function register(username: string, password: string, cookie?: string) {
  return SELF.fetch(`${BASE}/api/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ username, password }),
  });
}

function login(username: string, password: string) {
  return SELF.fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

function me(cookie?: string) {
  return SELF.fetch(`${BASE}/api/me`, {
    headers: cookie ? { cookie } : {},
  });
}

function changePassword(cookie: string, new_password: string, current_password?: string) {
  return SELF.fetch(`${BASE}/api/change-password`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(current_password !== undefined ? { current_password, new_password } : { new_password }),
  });
}

describe("auth integration", () => {
  beforeEach(async () => {
    // Pool-workers isolates storage per test file, but multiple tests share the
    // same migrated DB within this file. Ensure a clean slate so first-user
    // admin assertions hold for every test.
    await env.DRAFT_DB.prepare("DELETE FROM users").run();
    await env.DRAFT_DB.prepare("DELETE FROM participants").run();
    expect(await countUsers(env.DRAFT_DB)).toBe(0);
  });

  it("makes the first registered user an admin and /api/me returns that user", async () => {
    const res = await register("alice", "password1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: number; username: string; is_admin: boolean } };
    expect(body.user.username).toBe("alice");
    expect(body.user.is_admin).toBe(true);

    const cookie = sessionCookie(res);
    const meRes = await me(cookie);
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { user: { id: number; username: string; is_admin: boolean } };
    expect(meBody.user.id).toBe(body.user.id);
    expect(meBody.user.username).toBe("alice");
    expect(meBody.user.is_admin).toBe(true);
  });

  it("makes a second registered user a non-admin", async () => {
    await register("alice", "password1");
    const res = await register("bob", "password2");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { is_admin: boolean } };
    expect(body.user.is_admin).toBe(false);
  });

  it("logs in with correct credentials and rejects a wrong password", async () => {
    await register("alice", "password1");

    const good = await login("alice", "password1");
    expect(good.status).toBe(200);
    const goodBody = (await good.json()) as { user: { username: string } };
    expect(goodBody.user.username).toBe("alice");

    const bad = await login("alice", "wrong-password");
    expect(bad.status).toBe(401);
  });

  it("rejects a duplicate username with 409", async () => {
    const first = await register("alice", "password1");
    expect(first.status).toBe(200);

    const dup = await register("alice", "different");
    expect(dup.status).toBe(409);
  });

  it("returns 401 from /api/me without a cookie", async () => {
    const res = await me();
    expect(res.status).toBe(401);
  });

  it("revokes the old session cookie after change-password (token_version bump)", async () => {
    const reg = await register("alice", "password1");
    expect(reg.status).toBe(200);
    const cookieA = sessionCookie(reg);

    // Old cookie works before the password change.
    const before = await me(cookieA);
    expect(before.status).toBe(200);

    const changed = await changePassword(cookieA, "password2", "password1");
    expect(changed.status).toBe(200);
    // A fresh, valid cookie is issued on the change-password response.
    const cookieB = sessionCookie(changed);
    expect(cookieB).not.toBe(cookieA);

    // The OLD cookie is now invalid because token_version was bumped.
    const afterOld = await me(cookieA);
    expect(afterOld.status).toBe(401);
    const afterOldBody = (await afterOld.json()) as { error: string };
    expect(afterOldBody.error).toBe("session expired");

    // The NEW cookie still works.
    const afterNew = await me(cookieB);
    expect(afterNew.status).toBe(200);
  });

  it("rejects voluntary change-password with a wrong current_password → 401", async () => {
    const reg = await register("alice", "password1");
    expect(reg.status).toBe(200);
    const cookie = sessionCookie(reg);

    const res = await changePassword(cookie, "password2", "wrongpassword");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("current password incorrect");
  });

  it("rejects voluntary change-password with no current_password → 401", async () => {
    const reg = await register("alice", "password1");
    expect(reg.status).toBe(200);
    const cookie = sessionCookie(reg);

    // Omit current_password entirely (helper sends only new_password when current_password is undefined).
    const res = await changePassword(cookie, "password2");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("current password incorrect");
  });

  it("allows forced change-password (must_change_password=1) without current_password", async () => {
    const reg = await register("alice", "password1");
    expect(reg.status).toBe(200);

    // Directly mark the user as needing a forced password reset.
    await env.DRAFT_DB.prepare("UPDATE users SET must_change_password=1 WHERE username='alice'").run();

    // Log in again so the session cookie reflects must_change_password=1.
    const loginRes = await login("alice", "password1");
    expect(loginRes.status).toBe(200);
    const forcedCookie = sessionCookie(loginRes);

    // Forced path: no current_password required.
    const res = await changePassword(forcedCookie, "newpassword");
    expect(res.status).toBe(200);
  });
});
