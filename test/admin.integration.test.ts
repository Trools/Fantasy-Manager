import { SELF, env, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { DraftRoom } from "../src/worker/draft-room";

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

function adminPost(path: string, cookie: string, body?: unknown) {
  return SELF.fetch(`${BASE}/api/admin/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function adminPut(path: string, cookie: string, body: unknown) {
  return SELF.fetch(`${BASE}/api/admin/${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

async function settingsRow() {
  return env.DRAFT_DB.prepare(
    "SELECT total_picks, seconds_per_pick, pos_count, max_per_country, order_mode, status, current_pick_no FROM draft_settings WHERE id=1"
  ).first<any>();
}

/** Clear the singleton DO's in-memory cache so it rebuilds from the reset D1 rows. */
async function resetMainCache(): Promise<void> {
  const stub = env.DRAFT_ROOM.get(env.DRAFT_ROOM.idFromName("main"));
  const reset = runInDurableObject as unknown as (
    s: DurableObjectStub,
    cb: (instance: DraftRoom) => void
  ) => Promise<void>;
  await reset(stub, (instance) => {
    const inner = instance as unknown as { cache?: unknown; playerMap?: unknown };
    inner.cache = undefined;
    inner.playerMap = undefined;
  });
}

const VALID_SETTINGS = {
  seconds_per_pick: 90,
  pos_count: { GK: 1, DEF: 4, MID: 4, FWD: 2 }, // squad of 11
  max_per_country: 3,
  order_mode: "snake",
};

/** Seed `perPosition` active players in each position (distinct country codes) so
 *  the start-time pool-feasibility check passes. */
async function seedPool(perPosition: number): Promise<void> {
  const stmts = [];
  for (const pos of ["GK", "DEF", "MID", "FWD"]) {
    for (let i = 0; i < perPosition; i++) {
      stmts.push(
        env.DRAFT_DB.prepare(
          "INSERT INTO players (country, country_code, position, full_name, active) VALUES (?, ?, ?, ?, 1)"
        ).bind(`${pos}land${i}`, `${pos}${i}`, pos, `${pos} player ${i}`)
      );
    }
  }
  await env.DRAFT_DB.batch(stmts);
}

describe("admin integration", () => {
  beforeEach(async () => {
    await env.DRAFT_DB.prepare("DELETE FROM picks").run();
    await env.DRAFT_DB.prepare("DELETE FROM participants").run();
    await env.DRAFT_DB.prepare("DELETE FROM kicked_users").run();
    await env.DRAFT_DB.prepare("DELETE FROM players").run();
    await env.DRAFT_DB.prepare("DELETE FROM users").run();
    await env.DRAFT_DB.prepare(
      "UPDATE draft_settings SET total_picks=11, seconds_per_pick=90, pos_count='{\"GK\":1,\"DEF\":4,\"MID\":4,\"FWD\":2}', max_per_country=3, order_mode='snake', status='lobby', current_pick_no=NULL, timer_deadline=NULL WHERE id=1"
    ).run();
    // A generous pool so `start` passes feasibility (2 managers × {1,4,4,2}).
    await seedPool(10);
    await resetMainCache();
  });

  it("PUT /admin/settings rejects invalid settings with 400 and a message", async () => {
    const admin = await register("admin", "password1");
    const cookie = sessionCookie(admin);

    // An empty squad (all positions zero) is invalid.
    const res = await adminPut("settings", cookie, { ...VALID_SETTINGS, pos_count: { GK: 0, DEF: 0, MID: 0, FWD: 0 } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("at least 1 player");
  });

  it("PUT /admin/settings persists valid settings and derives total_picks", async () => {
    const admin = await register("admin", "password1");
    const cookie = sessionCookie(admin);

    const res = await adminPut("settings", cookie, {
      ...VALID_SETTINGS,
      seconds_per_pick: 60,
      pos_count: { GK: 1, DEF: 3, MID: 3, FWD: 1 }, // squad of 8
      max_per_country: 2,
      order_mode: "linear",
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });

    const row = await settingsRow();
    expect(row.total_picks).toBe(8); // derived from the sum of pos_count
    expect(row.seconds_per_pick).toBe(60);
    expect(row.max_per_country).toBe(2);
    expect(row.order_mode).toBe("linear");
    expect(JSON.parse(row.pos_count)).toEqual({ GK: 1, DEF: 3, MID: 3, FWD: 1 });
  });

  it("PUT /admin/settings is 403 for a non-admin", async () => {
    await register("admin", "password1");
    const bob = await register("bob", "password2");
    const bobCookie = sessionCookie(bob);

    const res = await adminPut("settings", bobCookie, VALID_SETTINGS);
    expect(res.status).toBe(403);
  });

  it("control proxy: randomize → start → pause flows through to the DO", async () => {
    const admin = await register("admin", "password1");
    const adminCookie = sessionCookie(admin);
    const bob = await register("bob", "password2");
    const bobCookie = sessionCookie(bob);

    expect((await join(adminCookie)).status).toBe(200);
    expect((await join(bobCookie)).status).toBe(200);

    const rnd = await adminPost("randomize", adminCookie);
    expect(rnd.status).toBe(200);

    const start = await adminPost("start", adminCookie);
    expect(start.status).toBe(200);
    let row = await settingsRow();
    expect(row.status).toBe("in_progress");
    expect(row.current_pick_no).toBe(1);

    const pause = await adminPost("pause", adminCookie);
    expect(pause.status).toBe(200);
    row = await settingsRow();
    expect(row.status).toBe("paused");
  });

  it("reset-password returns the temp password and bumps token_version", async () => {
    const admin = await register("admin", "password1");
    const adminCookie = sessionCookie(admin);
    const bob = await register("bob", "password2");
    const bobBody = (await bob.json()) as { user: { id: number } };
    const bobId = bobBody.user.id;

    const before = await env.DRAFT_DB.prepare("SELECT token_version FROM users WHERE id=?")
      .bind(bobId).first<{ token_version: number }>();

    const res = await adminPost(`users/${bobId}/reset-password`, adminCookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; temp_password: string };
    expect(body.ok).toBe(true);
    // A fresh, non-trivial random password (no longer the static shared constant).
    expect(typeof body.temp_password).toBe("string");
    expect(body.temp_password.length).toBeGreaterThanOrEqual(8);

    const after = await env.DRAFT_DB.prepare(
      "SELECT must_change_password, token_version FROM users WHERE id=?"
    ).bind(bobId).first<{ must_change_password: number; token_version: number }>();
    expect(after!.must_change_password).toBe(1);
    expect(after!.token_version).toBe(before!.token_version + 1);

    // The returned password must actually authenticate the user.
    const login = await SELF.fetch(`${BASE}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "bob", password: body.temp_password }),
    });
    expect(login.status).toBe(200);
    const loginBody = (await login.json()) as { must_change_password: boolean };
    expect(loginBody.must_change_password).toBe(true);

    // A second reset issues a different password.
    const res2 = await adminPost(`users/${bobId}/reset-password`, adminCookie);
    const body2 = (await res2.json()) as { temp_password: string };
    expect(body2.temp_password).not.toBe(body.temp_password);
  });

  it("reset-password is 404 for an unknown user", async () => {
    const admin = await register("admin", "password1");
    const cookie = sessionCookie(admin);
    const res = await adminPost("users/99999/reset-password", cookie);
    expect(res.status).toBe(404);
  });

  it("demote refuses the last admin, then succeeds once a second admin exists", async () => {
    const admin = await register("admin", "password1");
    const adminBody = (await admin.json()) as { user: { id: number } };
    const adminId = adminBody.user.id;
    const adminCookie = sessionCookie(admin);
    const bob = await register("bob", "password2");
    const bobBody = (await bob.json()) as { user: { id: number } };
    const bobId = bobBody.user.id;

    // Only one admin → cannot demote.
    const refused = await adminPost(`users/${adminId}/demote`, adminCookie);
    expect(refused.status).toBe(409);
    const refusedBody = (await refused.json()) as { error: string };
    expect(refusedBody.error).toBe("cannot demote the last admin");

    // Promote bob, then the original admin can be demoted.
    expect((await adminPost(`users/${bobId}/promote`, adminCookie)).status).toBe(200);
    const ok = await adminPost(`users/${adminId}/demote`, adminCookie);
    expect(ok.status).toBe(200);

    const row = await env.DRAFT_DB.prepare("SELECT is_admin FROM users WHERE id=?")
      .bind(adminId).first<{ is_admin: number }>();
    expect(row!.is_admin).toBe(0);
  });

  it("PUT /admin/settings with seconds_per_pick: 0 → 400", async () => {
    const admin = await register("admin", "password1");
    const cookie = sessionCookie(admin);

    const res = await adminPut("settings", cookie, { ...VALID_SETTINGS, seconds_per_pick: 0 });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("seconds_per_pick");
  });

  it("PUT /admin/settings with an invalid order_mode → 400", async () => {
    const admin = await register("admin", "password1");
    const cookie = sessionCookie(admin);

    const res = await adminPut("settings", cookie, { ...VALID_SETTINGS, order_mode: "random" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("order_mode");
  });

  it("promote a non-existent user id → 404", async () => {
    const admin = await register("admin", "password1");
    const cookie = sessionCookie(admin);

    const res = await adminPost("users/99999/promote", cookie);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("user not found");
  });

  it("demote a user who is already non-admin → 200 ok (no-op)", async () => {
    const admin = await register("admin", "password1");
    const adminCookie = sessionCookie(admin);
    const bob = await register("bob", "password2");
    const bobBody = (await bob.json()) as { user: { id: number } };
    const bobId = bobBody.user.id;

    // bob is already non-admin (second registration).
    const res = await adminPost(`users/${bobId}/demote`, adminCookie);
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });

    // bob is still non-admin.
    const row = await env.DRAFT_DB.prepare("SELECT is_admin FROM users WHERE id=?")
      .bind(bobId).first<{ is_admin: number }>();
    expect(row!.is_admin).toBe(0);
  });

  it("demote last admin still → 409", async () => {
    const admin = await register("admin", "password1");
    const adminBody = (await admin.json()) as { user: { id: number } };
    const adminId = adminBody.user.id;
    const adminCookie = sessionCookie(admin);

    const res = await adminPost(`users/${adminId}/demote`, adminCookie);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("cannot demote the last admin");
  });

  it("reset-draft clears picks and participants and returns to lobby", async () => {
    const admin = await register("admin", "password1");
    const adminCookie = sessionCookie(admin);
    const bob = await register("bob", "password2");
    const bobCookie = sessionCookie(bob);
    const bobBody = (await bob.json() as never) as { user: { id: number } };

    await join(adminCookie);
    await join(bobCookie);
    await adminPost("randomize", adminCookie);
    await adminPost("start", adminCookie);

    // Insert a pick directly.
    const player = await env.DRAFT_DB.prepare(
      "INSERT INTO players (country, country_code, position, full_name, active) VALUES ('France','FRA','FWD','Mbappe',1) RETURNING id"
    ).first<{ id: number }>();
    await env.DRAFT_DB.prepare(
      "INSERT INTO picks (overall_no, round_no, user_id, player_id, picked_by_user_id, picked_at) VALUES (1,1,?,?,?,?)"
    ).bind(bobBody.user.id, player!.id, bobBody.user.id, Date.now()).run();

    const res = await adminPost("reset-draft", adminCookie);
    expect(res.status).toBe(200);

    const picks = await env.DRAFT_DB.prepare("SELECT COUNT(*) AS n FROM picks").first<{ n: number }>();
    const parts = await env.DRAFT_DB.prepare("SELECT COUNT(*) AS n FROM participants").first<{ n: number }>();
    const row = await settingsRow();
    expect(picks!.n).toBe(0);
    expect(parts!.n).toBe(0);
    expect(row.status).toBe("lobby");
  });

  it("kick removes the targeted participant from the lobby", async () => {
    const admin = await register("admin", "password1");
    const adminCookie = sessionCookie(admin);
    const bob = await register("bob", "password2");
    const bobCookie = sessionCookie(bob);
    const bobId = ((await bob.json()) as { user: { id: number } }).user.id;

    await join(adminCookie);
    await join(bobCookie);

    const res = await adminPost(`participants/${bobId}/kick`, adminCookie);
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });

    // bob's row is gone; admin is still a participant.
    const bobRow = await env.DRAFT_DB.prepare(
      "SELECT COUNT(*) AS n FROM participants WHERE user_id=?"
    ).bind(bobId).first<{ n: number }>();
    expect(bobRow!.n).toBe(0);
    const all = await env.DRAFT_DB.prepare("SELECT COUNT(*) AS n FROM participants").first<{ n: number }>();
    expect(all!.n).toBe(1);
  });

  it("a kicked user is banned and cannot rejoin via /participants/join", async () => {
    const admin = await register("admin", "password1");
    const adminCookie = sessionCookie(admin);
    const bob = await register("bob", "password2");
    const bobCookie = sessionCookie(bob);
    const bobId = ((await bob.json()) as { user: { id: number } }).user.id;

    await join(adminCookie);
    await join(bobCookie);
    expect((await adminPost(`participants/${bobId}/kick`, adminCookie)).status).toBe(200);

    // The ban is recorded and the re-join is refused.
    const banned = await env.DRAFT_DB.prepare("SELECT COUNT(*) AS n FROM kicked_users WHERE user_id=?")
      .bind(bobId).first<{ n: number }>();
    expect(banned!.n).toBe(1);

    const rejoin = await join(bobCookie);
    expect(rejoin.status).toBe(403);
    const stillGone = await env.DRAFT_DB.prepare("SELECT COUNT(*) AS n FROM participants WHERE user_id=?")
      .bind(bobId).first<{ n: number }>();
    expect(stillGone!.n).toBe(0);

    // reset-draft clears the ban so a fresh draft can re-admit them.
    await adminPost("reset-draft", adminCookie);
    const cleared = await env.DRAFT_DB.prepare("SELECT COUNT(*) AS n FROM kicked_users").first<{ n: number }>();
    expect(cleared!.n).toBe(0);
  });

  it("kick is 403 for a non-admin", async () => {
    const admin = await register("admin", "password1");
    const adminId = ((await admin.json()) as { user: { id: number } }).user.id;
    const bob = await register("bob", "password2");
    const bobCookie = sessionCookie(bob);

    const res = await adminPost(`participants/${adminId}/kick`, bobCookie);
    expect(res.status).toBe(403);
  });

  it("kick outside the lobby → 409", async () => {
    const admin = await register("admin", "password1");
    const adminCookie = sessionCookie(admin);
    const bob = await register("bob", "password2");
    const bobId = ((await bob.json()) as { user: { id: number } }).user.id;

    await join(adminCookie);
    // Move the draft out of the lobby.
    await env.DRAFT_DB.prepare("UPDATE draft_settings SET status='in_progress' WHERE id=1").run();

    const res = await adminPost(`participants/${bobId}/kick`, adminCookie);
    expect(res.status).toBe(409);
  });

  it("kicking yourself → 400", async () => {
    const admin = await register("admin", "password1");
    const adminId = ((await admin.json()) as { user: { id: number } }).user.id;
    const adminCookie = sessionCookie(admin);

    await join(adminCookie);
    const res = await adminPost(`participants/${adminId}/kick`, adminCookie);
    expect(res.status).toBe(400);
  });
});
