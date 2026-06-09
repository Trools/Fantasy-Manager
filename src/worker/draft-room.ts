import type { Env } from "./db";
import { getSettingsRow, parseSettings, listParticipants, listPicks } from "./db";
import { pickerForPickNo, roundForPickNo } from "../shared/draft-logic";
import type { DraftState, ServerMsg } from "../shared/types";
import { verifySession } from "../shared/crypto";

export class DraftRoom {
  constructor(private ctx: DurableObjectState, private env: Env) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    const claims = await verifySession(token, this.env.SESSION_SECRET);
    if (!claims) return new Response("unauthorized", { status: 401 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId: claims.userId, username: claims.username, isAdmin: claims.isAdmin });
    server.send(JSON.stringify({ t: "state", state: await this.buildState() } satisfies ServerMsg));
    return new Response(null, { status: 101, webSocket: client });
  }

  async buildState(): Promise<DraftState> {
    const row = await getSettingsRow(this.env.DRAFT_DB);
    const s = parseSettings(row);
    const participants = await listParticipants(this.env.DRAFT_DB);
    const picks = await listPicks(this.env.DRAFT_DB);
    const order = participants
      .filter((p) => p.draft_order != null)
      .sort((a, b) => a.draft_order! - b.draft_order!)
      .map((p) => p.user_id);
    const cur = s.current_pick_no;
    const current_user_id = cur && order.length ? pickerForPickNo(cur, order, s.order_mode) : null;
    return {
      status: s.status,
      settings: {
        total_picks: s.total_picks,
        seconds_per_pick: s.seconds_per_pick,
        pos_min: s.pos_min,
        pos_max: s.pos_max,
        max_per_country: s.max_per_country,
        order_mode: s.order_mode,
      },
      participants,
      picks,
      current_pick_no: cur,
      current_user_id,
      timer_deadline: s.timer_deadline,
      round_no: cur && order.length ? roundForPickNo(cur, order.length) : null,
    };
  }

  broadcast(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) ws.send(data);
  }

  async webSocketClose(_ws: WebSocket): Promise<void> {
    /* hibernation handles cleanup */
  }

  async webSocketError(): Promise<void> {}
}
