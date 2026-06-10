import { SELF, env, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { signSession } from "../src/shared/crypto";
import type { DraftState, ServerMsg, SessionClaims } from "../src/shared/types";
import type { DraftRoom } from "../src/worker/draft-room";

const BASE = "https://example.com";

async function insertUser(username: string, isAdmin: boolean): Promise<number> {
  const res = await env.DRAFT_DB.prepare(
    `INSERT INTO users (username, password_hash, password_salt, is_admin, created_at)
     VALUES (?, 'x', 'x', ?, ?) RETURNING id`
  )
    .bind(username, isAdmin ? 1 : 0, Date.now())
    .first<{ id: number }>();
  return res!.id;
}

async function tokenFor(userId: number, username: string, isAdmin: boolean): Promise<string> {
  const claims: SessionClaims = {
    userId,
    username,
    isAdmin,
    mustChangePwd: false,
    tokenVersion: 0,
    iat: Date.now(),
  };
  // Must match the SESSION_SECRET binding configured in vitest.config.ts.
  return signSession(claims, "test-secret");
}

/** Open a WS to the worker and resolve with the first message received. */
function firstMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    ws.addEventListener("message", (ev) => resolve(ev.data as string), { once: true });
    ws.addEventListener("error", () => reject(new Error("ws error")), { once: true });
  });
}

async function insertPlayer(
  country: string,
  countryCode: string,
  position: string,
  fullName: string
): Promise<number> {
  const res = await env.DRAFT_DB.prepare(
    `INSERT INTO players (country, country_code, position, full_name, active)
     VALUES (?, ?, ?, ?, 1) RETURNING id`
  )
    .bind(country, countryCode, position, fullName)
    .first<{ id: number }>();
  return res!.id;
}

async function addParticipant(userId: number, draftOrder: number): Promise<void> {
  await env.DRAFT_DB.prepare(
    "INSERT INTO participants (user_id, draft_order, joined) VALUES (?, ?, 1)"
  )
    .bind(userId, draftOrder)
    .run();
}

/**
 * Open a WS and resolve once a message matching `predicate` arrives (skipping
 * the initial state snapshot and any intervening messages).
 */
function messageMatching(
  ws: WebSocket,
  predicate: (msg: ServerMsg) => boolean
): Promise<ServerMsg> {
  return new Promise((resolve, reject) => {
    const onMsg = (ev: MessageEvent) => {
      const msg = JSON.parse(ev.data as string) as ServerMsg;
      if (predicate(msg)) {
        ws.removeEventListener("message", onMsg as EventListener);
        resolve(msg);
      }
    };
    ws.addEventListener("message", onMsg as EventListener);
    ws.addEventListener("error", () => reject(new Error("ws error")), { once: true });
  });
}

describe("draft-room integration", () => {
  beforeEach(async () => {
    await env.DRAFT_DB.prepare("DELETE FROM picks").run();
    await env.DRAFT_DB.prepare("DELETE FROM participants").run();
    await env.DRAFT_DB.prepare("DELETE FROM users").run();
    // Reset settings to the seeded lobby defaults in case a prior test mutated them.
    await env.DRAFT_DB.prepare(
      "UPDATE draft_settings SET status='lobby', current_pick_no=NULL, timer_deadline=NULL WHERE id=1"
    ).run();
    // The DraftRoom DO is a process-wide singleton (idFromName("main")); its
    // in-memory cache survives across tests. Clear it so each test rebuilds
    // state from the freshly-reset D1 rows rather than reusing stale picks.
    const id = env.DRAFT_ROOM.idFromName("main");
    const stub: DurableObjectStub = env.DRAFT_ROOM.get(id);
    const resetCache = runInDurableObject as unknown as (
      s: DurableObjectStub,
      cb: (instance: DraftRoom) => void
    ) => Promise<void>;
    await resetCache(stub, (instance) => {
      const inner = instance as unknown as { cache?: unknown; playerMap?: unknown };
      inner.cache = undefined;
      inner.playerMap = undefined;
    });
  });

  it("rejects a WS connection without a valid token", async () => {
    const res = await SELF.fetch(`${BASE}/ws`, {
      headers: { Upgrade: "websocket" },
    });
    expect(res.status).toBe(401);
  });

  it("sends a full-state snapshot on connect with a valid session cookie", async () => {
    const uid = await insertUser("alice", true);
    const token = await tokenFor(uid, "alice", true);

    const res = await SELF.fetch(`${BASE}/ws`, {
      headers: {
        Upgrade: "websocket",
        Cookie: `wcd_session=${token}`,
      },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    expect(ws).toBeTruthy();
    ws!.accept();

    const raw = await firstMessage(ws!);
    const msg = JSON.parse(raw) as ServerMsg;
    expect(msg.t).toBe("state");
    const state = (msg as Extract<ServerMsg, { t: "state" }>).state as DraftState;

    expect(state.status).toBe("lobby");
    expect(state.current_pick_no).toBeNull();
    expect(state.current_user_id).toBeNull();
    expect(state.round_no).toBeNull();
    expect(state.settings.total_picks).toBe(11); // derived: 1+4+4+2 (seeded squad after 0002)
    expect(state.settings.order_mode).toBe("snake");
    expect(Array.isArray(state.participants)).toBe(true);
    expect(Array.isArray(state.picks)).toBe(true);

    ws!.close();
  });

  it("auto-joins the connecting user as a participant while in the lobby", async () => {
    const uid = await insertUser("alice", false);
    const token = await tokenFor(uid, "alice", false);

    const res = await SELF.fetch(`${BASE}/ws`, {
      headers: { Upgrade: "websocket", Cookie: `wcd_session=${token}` },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    ws.accept();

    const raw = await firstMessage(ws);
    const state = (JSON.parse(raw) as Extract<ServerMsg, { t: "state" }>).state;
    expect(state.participants.map((p) => p.user_id)).toContain(uid);

    const row = await env.DRAFT_DB.prepare("SELECT COUNT(*) AS n FROM participants WHERE user_id=?")
      .bind(uid).first<{ n: number }>();
    expect(row!.n).toBe(1);

    ws.close();
  });

  it("does NOT auto-join when the draft is already in progress (spectator)", async () => {
    await env.DRAFT_DB.prepare("UPDATE draft_settings SET status='in_progress', current_pick_no=1 WHERE id=1").run();
    const uid = await insertUser("late", false);
    const token = await tokenFor(uid, "late", false);

    const res = await SELF.fetch(`${BASE}/ws`, {
      headers: { Upgrade: "websocket", Cookie: `wcd_session=${token}` },
    });
    expect(res.status).toBe(101);
    res.webSocket!.accept();

    const row = await env.DRAFT_DB.prepare("SELECT COUNT(*) AS n FROM participants WHERE user_id=?")
      .bind(uid).first<{ n: number }>();
    expect(row!.n).toBe(0);

    res.webSocket!.close();
  });

  describe("pick handler", () => {
    let u1: number;
    let u2: number;
    let eligiblePlayer: number;

    beforeEach(async () => {
      u1 = await insertUser("p1", false);
      u2 = await insertUser("p2", false);
      await addParticipant(u1, 1);
      await addParticipant(u2, 2);
      // A handful of players; FWD "fra-fwd" is eligible for user 1's empty roster.
      eligiblePlayer = await insertPlayer("France", "FRA", "FWD", "Mbappe");
      await insertPlayer("Brazil", "BRA", "MID", "Neymar");
      await insertPlayer("Spain", "ESP", "DEF", "Carvajal");
      await env.DRAFT_DB.prepare(
        "UPDATE draft_settings SET status='in_progress', current_pick_no=1 WHERE id=1"
      ).run();
    });

    it("rejects a pick from a user when it is not their turn", async () => {
      const token = await tokenFor(u2, "p2", false);
      const res = await SELF.fetch(`${BASE}/ws`, {
        headers: { Upgrade: "websocket", Cookie: `wcd_session=${token}` },
      });
      expect(res.status).toBe(101);
      const ws = res.webSocket!;
      ws.accept();

      const errP = messageMatching(ws, (m) => m.t === "error");
      ws.send(JSON.stringify({ t: "pick", player_id: eligiblePlayer }));
      const msg = (await errP) as Extract<ServerMsg, { t: "error" }>;
      expect(msg.t).toBe("error");
      expect(msg.code).toBe("not_your_turn");

      ws.close();
    });

    it("accepts an eligible pick from the on-the-clock user and advances the draft", async () => {
      const token = await tokenFor(u1, "p1", false);
      const res = await SELF.fetch(`${BASE}/ws`, {
        headers: { Upgrade: "websocket", Cookie: `wcd_session=${token}` },
      });
      expect(res.status).toBe(101);
      const ws = res.webSocket!;
      ws.accept();

      const madeP = messageMatching(ws, (m) => m.t === "pick_made");
      const stateP = messageMatching(
        ws,
        (m) => m.t === "state" && (m as Extract<ServerMsg, { t: "state" }>).state.picks.length === 1
      );
      ws.send(JSON.stringify({ t: "pick", player_id: eligiblePlayer }));

      const made = (await madeP) as Extract<ServerMsg, { t: "pick_made" }>;
      expect(made.pick.player_id).toBe(eligiblePlayer);
      expect(made.by_username).toBe("p1");

      const stateMsg = (await stateP) as Extract<ServerMsg, { t: "state" }>;
      const state = stateMsg.state as DraftState;
      expect(state.picks.length).toBe(1);
      expect(state.current_pick_no).toBe(2);
      expect(state.current_user_id).toBe(u2);

      ws.close();
    });
  });

  describe("pick timer alarm + rehydration", () => {
    async function statusInD1(): Promise<string> {
      const row = await env.DRAFT_DB.prepare(
        "SELECT status FROM draft_settings WHERE id = 1"
      ).first<{ status: string }>();
      return row!.status;
    }

    it("alarm pauses an in-progress draft", async () => {
      const u1 = await insertUser("a1", false);
      const u2 = await insertUser("a2", false);
      await addParticipant(u1, 1);
      await addParticipant(u2, 2);
      await env.DRAFT_DB.prepare(
        "UPDATE draft_settings SET status='in_progress', current_pick_no=1, timer_deadline=? WHERE id=1"
      )
        .bind(Date.now() + 30000)
        .run();

      const stub = env.DRAFT_ROOM.get(env.DRAFT_ROOM.idFromName("main"));
      await runInDurableObject(stub, (inst: DraftRoom) => inst.alarm());

      expect(await statusInD1()).toBe("paused");
    });

    it("alarm is a no-op when the draft is not in_progress", async () => {
      // beforeEach resets status to 'lobby'.
      expect(await statusInD1()).toBe("lobby");

      const stub = env.DRAFT_ROOM.get(env.DRAFT_ROOM.idFromName("main"));
      await runInDurableObject(stub, (inst: DraftRoom) => inst.alarm());

      expect(await statusInD1()).toBe("lobby");
    });

    it("rehydration re-arms a future alarm on fresh construction", async () => {
      const deadline = Date.now() + 60000;
      await env.DRAFT_DB.prepare(
        "UPDATE draft_settings SET status='in_progress', current_pick_no=1, timer_deadline=? WHERE id=1"
      )
        .bind(deadline)
        .run();

      // Distinct DO name forces a fresh construction (and thus rehydrate()).
      const stub = env.DRAFT_ROOM.get(env.DRAFT_ROOM.idFromName("rehydrate-future"));
      const armed = await runInDurableObject(
        stub,
        (_inst: DraftRoom, ctx: DurableObjectState) => ctx.storage.getAlarm()
      );
      expect(armed).toBe(deadline);
    });

    it("rehydration fires immediately for a past deadline", async () => {
      await env.DRAFT_DB.prepare(
        "UPDATE draft_settings SET status='in_progress', current_pick_no=1, timer_deadline=? WHERE id=1"
      )
        .bind(Date.now() - 1000)
        .run();

      // Distinct DO name forces a fresh construction; rehydrate() should fire
      // alarm() synchronously because the deadline has already passed.
      const stub = env.DRAFT_ROOM.get(env.DRAFT_ROOM.idFromName("rehydrate-past"));
      // Touch the instance to ensure construction completes.
      await runInDurableObject(stub, (_inst: DraftRoom) => undefined);

      expect(await statusInD1()).toBe("paused");
    });
  });

  describe("admin commands", () => {
    function cmdStub(): DurableObjectStub {
      return env.DRAFT_ROOM.get(env.DRAFT_ROOM.idFromName("main"));
    }

    async function cmd(name: string, payload?: unknown, token?: string): Promise<Response> {
      const tok = token ?? adminToken;
      return cmdStub().fetch(`https://do/cmd/${name}?token=${encodeURIComponent(tok)}`, {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      });
    }

    async function settings(): Promise<{
      status: string;
      current_pick_no: number | null;
      timer_deadline: number | null;
    }> {
      const row = await env.DRAFT_DB.prepare(
        "SELECT status, current_pick_no, timer_deadline FROM draft_settings WHERE id = 1"
      ).first<{ status: string; current_pick_no: number | null; timer_deadline: number | null }>();
      return row!;
    }

    async function draftOrders(): Promise<Array<number | null>> {
      const { results } = await env.DRAFT_DB.prepare(
        "SELECT draft_order FROM participants ORDER BY user_id"
      ).all<{ draft_order: number | null }>();
      return results.map((r) => r.draft_order);
    }

    let u1: number;
    let u2: number;
    let u3: number;
    let admin: number;
    let adminToken: string;

    beforeEach(async () => {
      u1 = await insertUser("c1", false);
      u2 = await insertUser("c2", false);
      u3 = await insertUser("c3", false);
      admin = await insertUser("boss", true);
      adminToken = await tokenFor(admin, "boss", true);
    });

    it("rejects a command with no token with 401", async () => {
      const res = await cmdStub().fetch("https://do/cmd/refresh", {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
      const body = await res.json<{ error: string }>();
      expect(body.error).toBe("unauthenticated");
    });

    it("rejects a non-refresh command from a non-admin user with 403", async () => {
      const nonAdminToken = await tokenFor(u1, "c1", false);
      const res = await cmd("pause", {}, nonAdminToken);
      expect(res.status).toBe(403);
      const body = await res.json<{ error: string }>();
      expect(body.error).toBe("forbidden");
    });

    it("allows a non-admin authenticated user to call refresh", async () => {
      const nonAdminToken = await tokenFor(u1, "c1", false);
      const res = await cmd("refresh", {}, nonAdminToken);
      expect(res.status).toBe(200);
      const body = await res.json<{ ok: boolean }>();
      expect(body.ok).toBe(true);
    });

    it("randomize in lobby assigns a 1..N permutation to all joined participants", async () => {
      // joined participants with no draft_order yet
      await env.DRAFT_DB.prepare("INSERT INTO participants (user_id, joined) VALUES (?, 1)")
        .bind(u1)
        .run();
      await env.DRAFT_DB.prepare("INSERT INTO participants (user_id, joined) VALUES (?, 1)")
        .bind(u2)
        .run();
      await env.DRAFT_DB.prepare("INSERT INTO participants (user_id, joined) VALUES (?, 1)")
        .bind(u3)
        .run();

      const res = await cmd("randomize");
      expect(res.status).toBe(200);
      const orders = await draftOrders();
      expect(orders.every((o) => o != null)).toBe(true);
      expect([...orders].sort((a, b) => a! - b!)).toEqual([1, 2, 3]);
    });

    it("randomize rejects with 409 when not in lobby", async () => {
      await addParticipant(u1, 1);
      await addParticipant(u2, 2);
      await env.DRAFT_DB.prepare(
        "UPDATE draft_settings SET status='in_progress', current_pick_no=1 WHERE id=1"
      ).run();
      const res = await cmd("randomize");
      expect(res.status).toBe(409);
    });

    it("start moves a randomized lobby in_progress with pick 1 and a future timer", async () => {
      await addParticipant(u1, 1);
      await addParticipant(u2, 2);
      const before = Date.now();
      const res = await cmd("start");
      expect(res.status).toBe(200);
      const s = await settings();
      expect(s.status).toBe("in_progress");
      expect(s.current_pick_no).toBe(1);
      expect(s.timer_deadline).toBeGreaterThan(before);
    });

    it("start rejects with 409 when fewer than 2 participants", async () => {
      await addParticipant(u1, 1);
      const res = await cmd("start");
      expect(res.status).toBe(409);
    });

    it("start rejects with 409 when draft order is not set", async () => {
      await env.DRAFT_DB.prepare("INSERT INTO participants (user_id, joined) VALUES (?, 1)")
        .bind(u1)
        .run();
      await env.DRAFT_DB.prepare("INSERT INTO participants (user_id, joined) VALUES (?, 1)")
        .bind(u2)
        .run();
      const res = await cmd("start");
      expect(res.status).toBe(409);
    });

    it("pause / resume / extend transition the timer correctly", async () => {
      await addParticipant(u1, 1);
      await addParticipant(u2, 2);
      await cmd("start");

      const pauseRes = await cmd("pause");
      expect(pauseRes.status).toBe(200);
      let s = await settings();
      expect(s.status).toBe("paused");
      expect(s.timer_deadline).toBeNull();
      const alarmAfterPause = await runInDurableObject(
        cmdStub(),
        (_i: DraftRoom, ctx: DurableObjectState) => ctx.storage.getAlarm()
      );
      expect(alarmAfterPause).toBeNull();

      const before = Date.now();
      const resumeRes = await cmd("resume");
      expect(resumeRes.status).toBe(200);
      s = await settings();
      expect(s.status).toBe("in_progress");
      expect(s.timer_deadline).toBeGreaterThan(before);

      const deadlineBefore = s.timer_deadline!;
      const extRes = await cmd("extend", { seconds: 30 });
      expect(extRes.status).toBe(200);
      s = await settings();
      expect(s.timer_deadline).toBe(deadlineBefore + 30000);
    });

    it("undo removes the last pick and returns the clock to that pick", async () => {
      await addParticipant(u1, 1);
      await addParticipant(u2, 2);
      const fwd = await insertPlayer("France", "FRA", "FWD", "Mbappe");
      await cmd("start");

      // Admin picks on behalf to create pick #1, then we manually pause and undo.
      const pob = await cmd("pick-on-behalf", { player_id: fwd });
      expect(pob.status).toBe(200);
      let s = await settings();
      expect(s.current_pick_no).toBe(2);

      await env.DRAFT_DB.prepare(
        "UPDATE draft_settings SET status='paused', timer_deadline=NULL WHERE id=1"
      ).run();
      await resetMainCache();

      const res = await cmd("undo");
      expect(res.status).toBe(200);
      const picks = await env.DRAFT_DB.prepare("SELECT COUNT(*) AS n FROM picks").first<{ n: number }>();
      expect(picks!.n).toBe(0);
      s = await settings();
      expect(s.status).toBe("in_progress");
      expect(s.current_pick_no).toBe(1);
    });

    it("undo rejects with 409 when not paused", async () => {
      await addParticipant(u1, 1);
      await addParticipant(u2, 2);
      await cmd("start");
      const res = await cmd("undo");
      expect(res.status).toBe(409);
    });

    it("undo rejects with 409 when there are no picks", async () => {
      await addParticipant(u1, 1);
      await addParticipant(u2, 2);
      await cmd("start");
      await env.DRAFT_DB.prepare("UPDATE draft_settings SET status='paused' WHERE id=1").run();
      await resetMainCache();
      const res = await cmd("undo");
      expect(res.status).toBe(409);
    });

    it("pick-on-behalf records a pick for the current picker by the admin and advances", async () => {
      await addParticipant(u1, 1);
      await addParticipant(u2, 2);
      const fwd = await insertPlayer("France", "FRA", "FWD", "Mbappe");
      await cmd("start");

      const res = await cmd("pick-on-behalf", { player_id: fwd });
      expect(res.status).toBe(200);

      const pick = await env.DRAFT_DB.prepare(
        "SELECT user_id, picked_by_user_id FROM picks WHERE player_id=?"
      )
        .bind(fwd)
        .first<{ user_id: number; picked_by_user_id: number }>();
      expect(pick!.user_id).toBe(u1);
      // picked_by_user_id must be the authenticated admin (from the token), not a body value
      expect(pick!.picked_by_user_id).toBe(admin);

      const s = await settings();
      expect(s.current_pick_no).toBe(2);
    });

    it("pick-on-behalf while paused records the pick, resumes draft, and sets a fresh timer", async () => {
      // Documents the intended timeout-resolution behavior: pick-on-behalf is the
      // mechanism for resolving an expired timer. Calling it while paused should
      // record the pick for the current picker (attributed to admin), flip status
      // back to in_progress, advance current_pick_no, and install a fresh timer_deadline.
      await addParticipant(u1, 1);
      await addParticipant(u2, 2);
      const fwd = await insertPlayer("France", "FRA", "FWD", "Mbappe");
      await cmd("start");

      // Pause the draft (simulates timer expiry or manual pause).
      await cmd("pause");
      const pausedS = await settings();
      expect(pausedS.status).toBe("paused");

      const before = Date.now();
      const res = await cmd("pick-on-behalf", { player_id: fwd });
      expect(res.status).toBe(200);

      // Pick row must be recorded with the admin as picked_by_user_id and u1 as the owner.
      // picked_by_user_id comes from the verified token, not the request body.
      const pick = await env.DRAFT_DB.prepare(
        "SELECT user_id, picked_by_user_id FROM picks WHERE player_id=?"
      )
        .bind(fwd)
        .first<{ user_id: number; picked_by_user_id: number }>();
      expect(pick!.user_id).toBe(u1);
      expect(pick!.picked_by_user_id).toBe(admin);

      const s = await settings();
      // Draft must have resumed (not stayed paused).
      expect(s.status).toBe("in_progress");
      // Pick number must have advanced by 1.
      expect(s.current_pick_no).toBe(2);
      // A fresh timer_deadline must be set in the future.
      expect(s.timer_deadline).not.toBeNull();
      expect(s.timer_deadline!).toBeGreaterThan(before);
    });

    async function resetMainCache(): Promise<void> {
      const reset = runInDurableObject as unknown as (
        s: DurableObjectStub,
        cb: (instance: DraftRoom) => void
      ) => Promise<void>;
      await reset(cmdStub(), (instance) => {
        const inner = instance as unknown as { cache?: unknown; playerMap?: unknown };
        inner.cache = undefined;
        inner.playerMap = undefined;
      });
    }
  });
});
