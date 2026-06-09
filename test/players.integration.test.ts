import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { Player } from "../src/shared/types";

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

async function insertPlayer(country: string, code: string, position: string, fullName: string): Promise<number> {
  const res = await env.DRAFT_DB.prepare(
    `INSERT INTO players (country, country_code, position, full_name, active)
     VALUES (?, ?, ?, ?, 1) RETURNING id`
  ).bind(country, code, position, fullName).first<{ id: number }>();
  return res!.id;
}

function getPlayers(cookie?: string) {
  return SELF.fetch(`${BASE}/api/players`, { headers: cookie ? { cookie } : {} });
}

describe("players integration", () => {
  beforeEach(async () => {
    await env.DRAFT_DB.prepare("DELETE FROM picks").run();
    await env.DRAFT_DB.prepare("DELETE FROM participants").run();
    await env.DRAFT_DB.prepare("DELETE FROM players").run();
    await env.DRAFT_DB.prepare("DELETE FROM users").run();
    await env.DRAFT_DB.prepare(
      "UPDATE draft_settings SET status='lobby', current_pick_no=NULL, timer_deadline=NULL WHERE id=1"
    ).run();
  });

  it("GET /api/players returns active players with a cookie, 401 without", async () => {
    await insertPlayer("France", "FRA", "FWD", "Mbappe");
    await insertPlayer("Brazil", "BRA", "MID", "Neymar");

    // First user is admin; register a normal (second) user.
    await register("admin", "password1");
    const reg = await register("bob", "password2");
    expect(reg.status).toBe(200);
    const cookie = sessionCookie(reg);

    const ok = await getPlayers(cookie);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { players: Player[] };
    expect(body.players.length).toBe(2);

    const noCookie = await getPlayers();
    expect(noCookie.status).toBe(401);
  });

  it("DELETE disables an undrafted player and 409s a drafted one", async () => {
    const undrafted = await insertPlayer("France", "FRA", "FWD", "Mbappe");
    const drafted = await insertPlayer("Brazil", "BRA", "MID", "Neymar");

    const reg = await register("admin", "password1");
    expect(reg.status).toBe(200);
    const cookie = sessionCookie(reg);

    const del = await SELF.fetch(`${BASE}/api/players/${undrafted}`, { method: "DELETE", headers: { cookie } });
    expect(del.status).toBe(200);

    // The disabled player no longer appears in active players.
    const after = await getPlayers(cookie);
    const body = (await after.json()) as { players: Player[] };
    expect(body.players.some((p) => p.id === undrafted)).toBe(false);
    expect(body.players.some((p) => p.id === drafted)).toBe(true);

    // Reference the drafted player from picks, then attempt to delete it → 409.
    const u = await env.DRAFT_DB.prepare("SELECT id FROM users WHERE username='admin'").first<{ id: number }>();
    await env.DRAFT_DB.prepare(
      "INSERT INTO picks (overall_no, round_no, user_id, player_id, picked_by_user_id, picked_at) VALUES (1,1,?,?,?,?)"
    ).bind(u!.id, drafted, u!.id, Date.now()).run();

    const del409 = await SELF.fetch(`${BASE}/api/players/${drafted}`, { method: "DELETE", headers: { cookie } });
    expect(del409.status).toBe(409);
  });

  it("POST /api/players is 403 for non-admin, ok for admin", async () => {
    const adminReg = await register("admin", "password1");
    const adminCookie = sessionCookie(adminReg);
    const bobReg = await register("bob", "password2");
    const bobCookie = sessionCookie(bobReg);

    const body = JSON.stringify({ country: "Spain", country_code: "ESP", position: "DEF", full_name: "Carvajal" });

    const forbidden = await SELF.fetch(`${BASE}/api/players`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: bobCookie },
      body,
    });
    expect(forbidden.status).toBe(403);

    const ok = await SELF.fetch(`${BASE}/api/players`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body,
    });
    expect(ok.status).toBe(200);

    const list = await getPlayers(adminCookie);
    const listBody = (await list.json()) as { players: Player[] };
    expect(listBody.players.some((p) => p.full_name === "Carvajal")).toBe(true);
  });

  it("PUT /players/:id (admin) partial update changes only provided fields and GET reflects it", async () => {
    const id = await insertPlayer("Germany", "GER", "MID", "Kimmich");
    const adminReg = await register("admin", "password1");
    const adminCookie = sessionCookie(adminReg);

    const res = await SELF.fetch(`${BASE}/api/players/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ club: "Bayern Munich" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });

    const list = await getPlayers(adminCookie);
    const listBody = (await list.json()) as { players: Player[] };
    const updated = listBody.players.find((p) => p.id === id);
    expect(updated).toBeDefined();
    expect(updated!.club).toBe("Bayern Munich");
    // Unchanged fields are preserved.
    expect(updated!.full_name).toBe("Kimmich");
    expect(updated!.position).toBe("MID");
  });

  it("PUT /players/:id with an invalid position → 400", async () => {
    const id = await insertPlayer("Germany", "GER", "MID", "Kimmich");
    const adminReg = await register("admin", "password1");
    const adminCookie = sessionCookie(adminReg);

    const res = await SELF.fetch(`${BASE}/api/players/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ position: "STRIKER" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("bad position");
  });

  it("PUT /players/:id with a non-existent id → 404", async () => {
    const adminReg = await register("admin", "password1");
    const adminCookie = sessionCookie(adminReg);

    const res = await SELF.fetch(`${BASE}/api/players/99999`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ club: "Ghost FC" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("player not found");
  });

  it("DELETE /players/:id with a non-existent id → 404", async () => {
    const adminReg = await register("admin", "password1");
    const adminCookie = sessionCookie(adminReg);

    const res = await SELF.fetch(`${BASE}/api/players/99999`, {
      method: "DELETE",
      headers: { cookie: adminCookie },
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("player not found");
  });

  it("blockIfMustChange: GET /api/players → 403 when must_change_password is set", async () => {
    await insertPlayer("France", "FRA", "FWD", "Mbappe");

    // Register user; first user is admin but must_change_password is 0 on register.
    await register("admin", "password1");
    const bobReg = await register("bob", "password2");
    expect(bobReg.status).toBe(200);
    const bobBody = (await bobReg.json()) as { user: { id: number } };
    const bobId = bobBody.user.id;

    // Set must_change_password=1 directly in DB.
    await env.DRAFT_DB.prepare("UPDATE users SET must_change_password=1 WHERE id=?").bind(bobId).run();

    // Log in again so the session cookie reflects the updated must_change_password flag.
    const loginRes = await SELF.fetch(`${BASE}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "bob", password: "password2" }),
    });
    expect(loginRes.status).toBe(200);
    const forcedCookie = loginRes.headers.get("set-cookie")!.split(";")[0]!;

    const res = await getPlayers(forcedCookie);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("must_change_password");
  });
});
