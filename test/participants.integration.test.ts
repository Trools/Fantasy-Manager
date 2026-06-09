import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const BASE = "https://example.com";

function sessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";")[0]!;
}

function register(username: string, password: string) {
  return SELF.fetch(`${BASE}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

function join(cookie: string) {
  return SELF.fetch(`${BASE}/api/participants/join`, { method: "POST", headers: { cookie } });
}

function leave(cookie: string) {
  return SELF.fetch(`${BASE}/api/participants/leave`, { method: "POST", headers: { cookie } });
}

async function participantCount(userId: number): Promise<number> {
  const r = await env.DRAFT_DB.prepare("SELECT COUNT(*) AS n FROM participants WHERE user_id=?")
    .bind(userId).first<{ n: number }>();
  return r!.n;
}

describe("participants integration", () => {
  beforeEach(async () => {
    await env.DRAFT_DB.prepare("DELETE FROM picks").run();
    await env.DRAFT_DB.prepare("DELETE FROM participants").run();
    await env.DRAFT_DB.prepare("DELETE FROM users").run();
    await env.DRAFT_DB.prepare(
      "UPDATE draft_settings SET status='lobby', current_pick_no=NULL, timer_deadline=NULL WHERE id=1"
    ).run();
  });

  it("admin and non-admin can join in lobby (refresh works for non-admin)", async () => {
    const adminReg = await register("admin", "password1");
    const adminBody = (await adminReg.json()) as { user: { id: number } };
    const adminCookie = sessionCookie(adminReg);

    const adminJoin = await join(adminCookie);
    expect(adminJoin.status).toBe(200);
    expect(await participantCount(adminBody.user.id)).toBe(1);

    // Second user is a non-admin; their join triggers callDO("refresh") which must
    // succeed for a non-admin authenticated session (exercises Part A).
    const bobReg = await register("bob", "password2");
    const bobBody = (await bobReg.json()) as { user: { id: number; is_admin: boolean } };
    expect(bobBody.user.is_admin).toBe(false);
    const bobCookie = sessionCookie(bobReg);

    const bobJoin = await join(bobCookie);
    expect(bobJoin.status).toBe(200);
    expect(await participantCount(bobBody.user.id)).toBe(1);
  });

  it("join is 409 once the draft is no longer in lobby", async () => {
    const reg = await register("admin", "password1");
    const cookie = sessionCookie(reg);

    await env.DRAFT_DB.prepare("UPDATE draft_settings SET status='in_progress' WHERE id=1").run();

    const res = await join(cookie);
    expect(res.status).toBe(409);
  });

  it("leave removes the participant row in lobby", async () => {
    const reg = await register("admin", "password1");
    const body = (await reg.json()) as { user: { id: number } };
    const cookie = sessionCookie(reg);

    await join(cookie);
    expect(await participantCount(body.user.id)).toBe(1);

    const res = await leave(cookie);
    expect(res.status).toBe(200);
    expect(await participantCount(body.user.id)).toBe(0);
  });
});
