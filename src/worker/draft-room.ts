import type { Env } from "./db";
import { getSettingsRow, parseSettings, listParticipants, listPicks, getActivePlayers } from "./db";
import { pickerForPickNo, roundForPickNo, eligibility, rosterFromPicks, isDraftComplete } from "../shared/draft-logic";
import type { DraftState, ServerMsg, Player, Pick } from "../shared/types";
import { verifySession } from "../shared/crypto";

export class DraftRoom {
  private cache?: DraftState;
  private playerMap?: Map<number, Player>;

  constructor(private ctx: DurableObjectState, private env: Env) {
    this.ctx.blockConcurrencyWhile(() => this.rehydrate());
  }

  async alarm() {
    const row = await getSettingsRow(this.env.DRAFT_DB);
    if (!row || row.status !== "in_progress") return;
    await this.env.DRAFT_DB.prepare("UPDATE draft_settings SET status='paused' WHERE id=1").run();
    this.cache = undefined; // force rebuild from D1
    this.broadcast({ t: "state", state: await this.buildState() });
  }

  private async rehydrate() {
    const row = await getSettingsRow(this.env.DRAFT_DB);
    if (!row) return;
    const s = parseSettings(row);
    if (s.status === "in_progress" && s.timer_deadline) {
      if (s.timer_deadline <= Date.now()) await this.alarm();
      else await this.ctx.storage.setAlarm(s.timer_deadline);
    }
  }

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

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    if (msg.t === "ping") return ws.send(JSON.stringify({ t: "pong" }));
    if (msg.t !== "pick") return;
    const att = ws.deserializeAttachment() as { userId: number; username: string };
    const state = this.cache ?? (this.cache = await this.buildState());
    const players = this.playerMap ?? (this.playerMap = new Map(
      (await getActivePlayers(this.env.DRAFT_DB)).map(p => [p.id, p])));
    // ---- SYNCHRONOUS GUARD + MUTATE + BROADCAST (no await until after broadcast) ----
    if (state.status !== "in_progress")
      return ws.send(JSON.stringify({ t: "error", code: "not_active", message: "Draft not active" }));
    if (state.current_user_id !== att.userId)
      return ws.send(JSON.stringify({ t: "error", code: "not_your_turn", message: "Not your turn" }));
    const player = players.get(msg.player_id);
    if (!player)
      return ws.send(JSON.stringify({ t: "error", code: "no_player", message: "Unknown player" }));
    if (state.picks.some(p => p.player_id === player.id))
      return ws.send(JSON.stringify({ t: "error", code: "taken", message: "Already drafted" }));
    const roster = rosterFromPicks(state.picks, players, att.userId);
    const elig = eligibility(player.position, player.country_code, roster, state.settings);
    if (!elig.ok)
      return ws.send(JSON.stringify({ t: "error", code: "ineligible", message: elig.reason! }));
    const order = state.participants.filter(p => p.draft_order != null)
      .sort((a, b) => (a.draft_order! - b.draft_order!)).map(p => p.user_id);
    const overall = state.current_pick_no!;
    const pick: Pick = { overall_no: overall, round_no: roundForPickNo(overall, order.length),
      user_id: att.userId, player_id: player.id, picked_by_user_id: att.userId, picked_at: Date.now() };
    state.picks.push(pick);
    const complete = isDraftComplete(state.picks.length, order, state.settings.total_picks);
    const nextNo = complete ? overall : overall + 1;
    state.current_pick_no = complete ? null : nextNo;
    state.status = complete ? "complete" : "in_progress";
    state.current_user_id = complete ? null : pickerForPickNo(nextNo, order, state.settings.order_mode);
    state.round_no = complete ? null : roundForPickNo(nextNo, order.length);
    const deadline = complete ? null : Date.now() + state.settings.seconds_per_pick * 1000;
    state.timer_deadline = deadline;
    this.broadcast({ t: "pick_made", pick, player, by_username: att.username });
    this.broadcast({ t: "state", state });
    // ---- AWAIT PERSIST (after in-memory state committed + broadcast) ----
    await this.persistPick(pick, state.status, state.current_pick_no, deadline);
    if (deadline) await this.ctx.storage.setAlarm(deadline); else await this.ctx.storage.deleteAlarm();
  }

  private async persistPick(pick: Pick, status: string, currentNo: number | null, deadline: number | null) {
    await this.env.DRAFT_DB.batch([
      this.env.DRAFT_DB.prepare(
        "INSERT INTO picks (overall_no,round_no,user_id,player_id,picked_by_user_id,picked_at) VALUES (?,?,?,?,?,?)")
        .bind(pick.overall_no, pick.round_no, pick.user_id, pick.player_id, pick.picked_by_user_id, pick.picked_at),
      this.env.DRAFT_DB.prepare("UPDATE draft_settings SET status=?, current_pick_no=?, timer_deadline=? WHERE id=1")
        .bind(status, currentNo, deadline),
    ]);
  }

  async webSocketClose(_ws: WebSocket): Promise<void> {
    /* hibernation handles cleanup */
  }

  async webSocketError(): Promise<void> {}
}
