import { SELF, env, runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
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
    expect(state.settings.total_picks).toBe(12);
    expect(state.settings.order_mode).toBe("snake");
    expect(Array.isArray(state.participants)).toBe(true);
    expect(Array.isArray(state.picks)).toBe(true);

    ws!.close();
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
});
