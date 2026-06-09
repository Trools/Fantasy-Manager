import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { signSession } from "../src/shared/crypto";
import type { DraftState, ServerMsg, SessionClaims } from "../src/shared/types";

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

describe("draft-room integration", () => {
  beforeEach(async () => {
    await env.DRAFT_DB.prepare("DELETE FROM picks").run();
    await env.DRAFT_DB.prepare("DELETE FROM participants").run();
    await env.DRAFT_DB.prepare("DELETE FROM users").run();
    // Reset settings to the seeded lobby defaults in case a prior test mutated them.
    await env.DRAFT_DB.prepare(
      "UPDATE draft_settings SET status='lobby', current_pick_no=NULL, timer_deadline=NULL WHERE id=1"
    ).run();
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
});
