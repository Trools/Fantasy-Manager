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
    if (url.pathname === "/ws") return this.handleWs(req);
    if (url.pathname.startsWith("/cmd/")) return this.handleCommand(url.pathname.slice(5), req);
    return new Response("not found", { status: 404 });
  }

  private async handleWs(req: Request): Promise<Response> {
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

  private async handleCommand(cmd: string, req: Request): Promise<Response> {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const db = this.env.DRAFT_DB;

    switch (cmd) {
      case "refresh": {
        this.cache = undefined;
        this.playerMap = undefined;
        this.broadcast({ t: "state", state: await this.buildState() });
        return Response.json({ ok: true });
      }

      case "randomize": {
        const row = await getSettingsRow(db);
        const s = parseSettings(row);
        if (s.status !== "lobby")
          return Response.json({ error: "Draft not in lobby" }, { status: 409 });
        const { results } = await db
          .prepare("SELECT user_id FROM participants WHERE joined=1")
          .all<{ user_id: number }>();
        const ids = results.map((r) => r.user_id);
        // Fisher-Yates shuffle with crypto randomness (Math.random unavailable here).
        for (let i = ids.length - 1; i > 0; i--) {
          const j = this.randInt(i + 1);
          [ids[i], ids[j]] = [ids[j]!, ids[i]!];
        }
        await db.batch(
          ids.map((uid, idx) =>
            db.prepare("UPDATE participants SET draft_order=? WHERE user_id=?").bind(idx + 1, uid)
          )
        );
        this.cache = undefined;
        this.broadcast({ t: "state", state: await this.buildState() });
        return Response.json({ ok: true });
      }

      case "start": {
        const row = await getSettingsRow(db);
        const s = parseSettings(row);
        if (s.status !== "lobby")
          return Response.json({ error: "Draft not in lobby" }, { status: 409 });
        const participants = await listParticipants(db);
        const joined = participants.filter((p) => p.joined);
        if (joined.length < 2)
          return Response.json({ error: "Need at least 2 participants" }, { status: 409 });
        if (joined.some((p) => p.draft_order == null))
          return Response.json({ error: "Draft order not set; randomize first" }, { status: 409 });
        const deadline = Date.now() + s.seconds_per_pick * 1000;
        await db
          .prepare(
            "UPDATE draft_settings SET status='in_progress', current_pick_no=1, timer_deadline=? WHERE id=1"
          )
          .bind(deadline)
          .run();
        await this.ctx.storage.setAlarm(deadline);
        this.cache = undefined;
        this.broadcast({ t: "state", state: await this.buildState() });
        return Response.json({ ok: true });
      }

      case "pause": {
        const row = await getSettingsRow(db);
        const s = parseSettings(row);
        if (s.status !== "in_progress")
          return Response.json({ error: "Draft not in progress" }, { status: 409 });
        await db
          .prepare("UPDATE draft_settings SET status='paused', timer_deadline=NULL WHERE id=1")
          .run();
        await this.ctx.storage.deleteAlarm();
        this.cache = undefined;
        this.broadcast({ t: "state", state: await this.buildState() });
        return Response.json({ ok: true });
      }

      case "resume": {
        const row = await getSettingsRow(db);
        const s = parseSettings(row);
        if (s.status !== "paused")
          return Response.json({ error: "Draft not paused" }, { status: 409 });
        const deadline = Date.now() + s.seconds_per_pick * 1000;
        await db
          .prepare("UPDATE draft_settings SET status='in_progress', timer_deadline=? WHERE id=1")
          .bind(deadline)
          .run();
        await this.ctx.storage.setAlarm(deadline);
        this.cache = undefined;
        this.broadcast({ t: "state", state: await this.buildState() });
        return Response.json({ ok: true });
      }

      case "extend": {
        const row = await getSettingsRow(db);
        const s = parseSettings(row);
        if (s.status !== "in_progress" || s.timer_deadline == null)
          return Response.json({ error: "No active timer to extend" }, { status: 409 });
        const seconds = Number(body.seconds) || 0;
        const deadline = s.timer_deadline + seconds * 1000;
        await db
          .prepare("UPDATE draft_settings SET timer_deadline=? WHERE id=1")
          .bind(deadline)
          .run();
        await this.ctx.storage.setAlarm(deadline);
        this.cache = undefined;
        this.broadcast({ t: "state", state: await this.buildState() });
        return Response.json({ ok: true });
      }

      case "undo": {
        const row = await getSettingsRow(db);
        const s = parseSettings(row);
        if (s.status !== "paused")
          return Response.json({ error: "Draft not paused" }, { status: 409 });
        const picks = await listPicks(db);
        if (picks.length === 0)
          return Response.json({ error: "No picks to undo" }, { status: 409 });
        const lastNo = Math.max(...picks.map((p) => p.overall_no));
        const deadline = Date.now() + s.seconds_per_pick * 1000;
        await db.batch([
          db.prepare("DELETE FROM picks WHERE overall_no=?").bind(lastNo),
          db
            .prepare(
              "UPDATE draft_settings SET status='in_progress', current_pick_no=?, timer_deadline=? WHERE id=1"
            )
            .bind(lastNo, deadline),
        ]);
        await this.ctx.storage.setAlarm(deadline);
        this.cache = undefined;
        this.broadcast({ t: "state", state: await this.buildState() });
        return Response.json({ ok: true });
      }

      case "pick-on-behalf": {
        // Intentional: pick-on-behalf is the timeout-resolution action. When called while
        // the draft is paused (e.g. timer expired), it records the pick for the current
        // picker AND resumes the draft (status → in_progress, new timer_deadline set).
        const state = (this.cache = await this.buildState());
        if (state.status !== "in_progress" && state.status !== "paused")
          return Response.json({ error: "Draft not active" }, { status: 409 });
        const currentPicker = state.current_user_id;
        if (currentPicker == null)
          return Response.json({ error: "No picker on the clock" }, { status: 409 });
        const adminId = Number(body.admin_id);
        const players =
          this.playerMap ??
          (this.playerMap = new Map((await getActivePlayers(db)).map((p) => [p.id, p])));
        const player = players.get(Number(body.player_id));
        if (!player) return Response.json({ error: "Unknown player" }, { status: 409 });
        if (state.picks.some((p) => p.player_id === player.id))
          return Response.json({ error: "Already drafted" }, { status: 409 });
        const roster = rosterFromPicks(state.picks, players, currentPicker);
        const elig = eligibility(player.position, player.country_code, roster, state.settings);
        if (!elig.ok) return Response.json({ error: elig.reason! }, { status: 409 });
        const order = this.orderFromState(state);
        const byUsername =
          state.participants.find((p) => p.user_id === adminId)?.username ?? "admin";
        await this.applyPick(state, order, player, currentPicker, adminId, byUsername);
        return Response.json({ ok: true });
      }

      default:
        return new Response("not found", { status: 404 });
    }
  }

  /** Uniform random integer in [0, max) via rejection sampling (no modulo bias). */
  private randInt(max: number): number {
    // uniform integer in [0, max) via rejection sampling (no modulo bias)
    if (max <= 0) return 0;
    const limit = Math.floor(256 / max) * max;
    const buf = new Uint8Array(1);
    let x: number;
    do { crypto.getRandomValues(buf); x = buf[0]!; } while (x >= limit);
    return x % max;
  }

  private orderFromState(state: DraftState): number[] {
    return state.participants
      .filter((p) => p.draft_order != null)
      .sort((a, b) => a.draft_order! - b.draft_order!)
      .map((p) => p.user_id);
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
    const order = this.orderFromState(state);
    await this.applyPick(state, order, player, att.userId, att.userId, att.username);
  }

  /**
   * Commit a pick into the in-memory `state` and broadcast, then persist + (re)set
   * the alarm. CRITICAL: there is NO `await` between the first state mutation and the
   * two broadcasts — this preserves the race-safety of the on-the-clock turn check.
   * Callers MUST perform all guards (status, turn ownership, eligibility, …) before
   * invoking this method.
   */
  private async applyPick(
    state: DraftState,
    order: number[],
    player: Player,
    forUserId: number,
    byUserId: number,
    byUsername: string
  ) {
    // ---- SYNCHRONOUS MUTATE + BROADCAST (no await until after the broadcasts) ----
    const overall = state.current_pick_no!;
    const pick: Pick = {
      overall_no: overall,
      round_no: roundForPickNo(overall, order.length),
      user_id: forUserId,
      player_id: player.id,
      picked_by_user_id: byUserId,
      picked_at: Date.now(),
    };
    state.picks.push(pick);
    const complete = isDraftComplete(state.picks.length, order, state.settings.total_picks);
    const nextNo = complete ? overall : overall + 1;
    state.current_pick_no = complete ? null : nextNo;
    state.status = complete ? "complete" : "in_progress";
    state.current_user_id = complete ? null : pickerForPickNo(nextNo, order, state.settings.order_mode);
    state.round_no = complete ? null : roundForPickNo(nextNo, order.length);
    const deadline = complete ? null : Date.now() + state.settings.seconds_per_pick * 1000;
    state.timer_deadline = deadline;
    this.broadcast({ t: "pick_made", pick, player, by_username: byUsername });
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
