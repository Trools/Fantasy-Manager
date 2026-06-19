import type { Env } from "./db";
import { getSettingsRow, parseSettings, listParticipants, listPicks, getActivePlayers, getUserById } from "./db";
import { pickerForPickNo, roundForPickNo, eligibility, rosterFromPicks, isDraftComplete, infeasiblePositions } from "../shared/draft-logic";
import type { DraftState, ServerMsg, Player, Pick, PosCounts, Position, Participant } from "../shared/types";
import { verifySession } from "../shared/crypto";

export class DraftRoom {
  private cache?: DraftState;
  private playerMap?: Map<number, Player>;
  /** Serializes pick mutations within this DO instance (see withLock). */
  private lock: Promise<unknown> = Promise.resolve();

  constructor(private ctx: DurableObjectState, private env: Env) {
    this.ctx.blockConcurrencyWhile(() => this.rehydrate());
  }

  /**
   * Run `fn` as a critical section serialized against every other withLock call
   * on this instance. The DO input gate is released across D1/`fetch` awaits, so
   * two concurrent `webSocketMessage` events can otherwise interleave their
   * read-modify-write of a pick (both passing the on-the-clock guard before
   * either mutates). Chaining on a single promise guarantees the load → guard →
   * mutate → persist of one pick fully completes before the next begins, so a
   * second pick always sees the already-advanced `current_user_id`. The
   * `idx_picks_player` unique index is the cross-instance backstop.
   */
  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    // Keep the chain alive even if fn rejects, but don't swallow the result.
    this.lock = run.then(() => undefined, () => undefined);
    return run;
  }

  async alarm() {
    // Conditional, atomic pause: only fire if the draft is still in_progress AND
    // the deadline this alarm was set for has actually passed. A buzzer-beater
    // pick that completes just before this fires installs a NEW future deadline;
    // without the `timer_deadline <= now` guard a stale alarm would clobber that
    // live pick into a spurious pause. Clearing timer_deadline keeps the paused
    // row consistent with the explicit `pause` command. (Review H2 + L1.)
    const res = await this.env.DRAFT_DB
      .prepare(
        "UPDATE draft_settings SET status='paused', timer_deadline=NULL " +
        "WHERE id=1 AND status='in_progress' AND timer_deadline IS NOT NULL AND timer_deadline <= ?"
      )
      .bind(Date.now())
      .run();
    if ((res.meta.changes ?? 0) === 0) return; // stale/superseded alarm — nothing to pause
    await this.ctx.storage.deleteAlarm();
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
    // Prefer the internal header so the token never lands in the DO request URL
    // (and thus request logs/traces); fall back to the query for direct callers. (M13.)
    const token = req.headers.get("X-Session-Token") ?? url.searchParams.get("token") ?? "";
    const claims = await verifySession(token, this.env.SESSION_SECRET);
    if (!claims) return new Response("unauthorized", { status: 401 });
    // The REST middleware revalidates token_version + must_change on every call;
    // the long-lived WS path must do the same on connect, else a revoked user
    // (password changed / admin reset) or a must-change user keeps a working
    // socket and can still send picks. (Review M16.)
    const user = await getUserById(this.env.DRAFT_DB, claims.userId);
    if (!user || user.token_version !== claims.tokenVersion || user.must_change_password)
      return new Response("unauthorized", { status: 401 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId: claims.userId, username: claims.username, isAdmin: claims.isAdmin });

    // Auto-join: entering the lobby registers you as a participant. Only while in the
    // lobby — connecting to an in-progress/complete draft is read-only (spectator).
    // A kicked user is NOT auto-joined: they connect as a read-only spectator.
    const row = await getSettingsRow(this.env.DRAFT_DB);
    let joined = false;
    if (row?.status === "lobby" && !(await this.isKicked(claims.userId))) {
      const res = await this.env.DRAFT_DB
        .prepare("INSERT OR IGNORE INTO participants (user_id, joined) VALUES (?, 1)")
        .bind(claims.userId)
        .run();
      joined = (res.meta.changes ?? 0) > 0;
    }

    const state = await this.buildState();
    if (joined) {
      this.cache = undefined;
      this.broadcast({ t: "state", state }); // reaches everyone, including this new socket
    } else {
      server.send(JSON.stringify({ t: "state", state } satisfies ServerMsg));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleCommand(cmd: string, req: Request): Promise<Response> {
    const token = req.headers.get("X-Session-Token") ?? new URL(req.url).searchParams.get("token") ?? "";
    const claims = await verifySession(token, this.env.SESSION_SECRET);
    if (!claims) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 });
    // `refresh` only needs a valid authenticated session (it just invalidates the
    // cache + rebroadcasts state). Every other command requires admin.
    if (cmd !== "refresh" && !claims.isAdmin)
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const db = this.env.DRAFT_DB;

    switch (cmd) {
      case "refresh": {
        this.cache = undefined;
        this.playerMap = undefined;
        // If we're back in the lobby (e.g. after a reset), make sure everyone still
        // connected is re-registered as a participant — reset-draft wipes the table.
        const row = await getSettingsRow(db);
        if (row?.status === "lobby") {
          // Back in the lobby: any timer alarm left armed by a prior in_progress
          // run is now meaningless — drop it. (Review: reset-leaves-alarm.)
          await this.ctx.storage.deleteAlarm();
          const ids = new Set<number>();
          for (const ws of this.ctx.getWebSockets()) {
            const att = ws.deserializeAttachment() as { userId?: number } | null;
            if (att?.userId) ids.add(att.userId);
          }
          // Never silently re-register a kicked user via refresh.
          const banned = new Set<number>();
          if (ids.size) {
            const { results } = await db
              .prepare(
                `SELECT user_id FROM kicked_users WHERE user_id IN (${[...ids].map(() => "?").join(",")})`
              )
              .bind(...ids)
              .all<{ user_id: number }>();
            for (const r of results) banned.add(r.user_id);
          }
          const toAdd = [...ids].filter((id) => !banned.has(id));
          if (toAdd.length)
            await db.batch(
              toAdd.map((id) =>
                db.prepare("INSERT OR IGNORE INTO participants (user_id, joined) VALUES (?, 1)").bind(id)
              )
            );
        }
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
        const withoutOrder = joined.filter((p) => p.draft_order == null);
        const withOrder = joined.filter((p) => p.draft_order != null);
        if (withoutOrder.length) {
          // No one has an order yet → the admin still needs to randomize.
          if (withOrder.length === 0)
            return Response.json({ error: "Draft order not set; randomize first" }, { status: 409 });
          // Late joiners (connected after randomize): append them to the end of
          // the order instead of forcing a full re-randomize of everyone. (M4.)
          let next = Math.max(...withOrder.map((p) => p.draft_order!)) + 1;
          await db.batch(
            withoutOrder.map((p) =>
              db.prepare("UPDATE participants SET draft_order=? WHERE user_id=?").bind(next++, p.user_id)
            )
          );
        }
        // Feasibility: the active pool must be able to fill every squad. Reject an
        // impossible configuration here rather than letting it deadlock mid-draft
        // once the scarcest position drains. (Review C1/H5.)
        const pool = await this.activePoolByPosition(db);
        const infeasible = infeasiblePositions(s.pos_count, joined.length, pool);
        if (infeasible.length) {
          const detail = infeasible
            .map((x) => `${x.position}: need ${x.need}, have ${x.have}`)
            .join("; ");
          return Response.json(
            { error: `Not enough players to fill every squad — ${detail}` },
            { status: 409 }
          );
        }
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
        // Serialized under the lock so it can't collide with a concurrent ws pick from
        // the on-the-clock user (Review M6). `override` relaxes the country cap only,
        // as the admin deadlock-breaker (Review H6).
        return this.withLock(async () => {
          const state = (this.cache = await this.buildState());
          if (state.status !== "in_progress" && state.status !== "paused")
            return Response.json({ error: "Draft not active" }, { status: 409 });
          const currentPicker = state.current_user_id;
          if (currentPicker == null)
            return Response.json({ error: "No picker on the clock" }, { status: 409 });
          const players =
            this.playerMap ??
            (this.playerMap = new Map((await getActivePlayers(db)).map((p) => [p.id, p])));
          const player = players.get(Number(body.player_id));
          if (!player) return Response.json({ error: "Unknown player" }, { status: 409 });
          if (state.picks.some((p) => p.player_id === player.id))
            return Response.json({ error: "Already drafted" }, { status: 409 });
          const roster = rosterFromPicks(state.picks, players, currentPicker);
          const elig = eligibility(player.position, player.country_code, roster, state.settings, {
            ignoreCountryCap: body.override === true,
          });
          if (!elig.ok) return Response.json({ error: elig.reason! }, { status: 409 });
          const order = this.orderFromState(state);
          try {
            await this.applyPick(state, order, player, currentPicker, claims.userId, claims.username);
          } catch {
            this.cache = undefined; // durable write failed — rebuild from D1 next read
            return Response.json({ error: "Pick could not be saved" }, { status: 409 });
          }
          return Response.json({ ok: true });
        });
      }

      case "kick": {
        const row = await getSettingsRow(db);
        if (row?.status !== "lobby")
          return Response.json({ error: "Can only kick from the lobby" }, { status: 409 });
        const targetId = Number(body.user_id);
        if (!Number.isInteger(targetId))
          return Response.json({ error: "Invalid user_id" }, { status: 400 });
        if (targetId === claims.userId)
          return Response.json({ error: "You cannot kick yourself" }, { status: 400 });

        // Remove from the lobby AND record the ban so no re-entry path (auto-join,
        // /participants/join, refresh) silently re-adds them. (Review H3.)
        await db.batch([
          db.prepare("DELETE FROM participants WHERE user_id=?").bind(targetId),
          db.prepare("INSERT OR IGNORE INTO kicked_users (user_id) VALUES (?)").bind(targetId),
        ]);

        // Evict the kicked user's live socket(s): tell them, then close. Closing before
        // the broadcast means this command does no re-registration (unlike `refresh`),
        // so the deleted row stays gone.
        for (const ws of this.ctx.getWebSockets()) {
          const att = ws.deserializeAttachment() as { userId?: number } | null;
          if (att?.userId === targetId) {
            try { ws.send(JSON.stringify({ t: "kicked" } satisfies ServerMsg)); } catch {}
            ws.close(1000, "kicked");
          }
        }

        this.cache = undefined;
        this.broadcast({ t: "state", state: await this.buildState() });
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

  /** Count of active players available for each position. */
  private async activePoolByPosition(db: Env["DRAFT_DB"]): Promise<PosCounts> {
    const counts: PosCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    const { results } = await db
      .prepare("SELECT position, COUNT(*) AS n FROM players WHERE active=1 GROUP BY position")
      .all<{ position: string; n: number }>();
    for (const r of results) if (r.position in counts) counts[r.position as Position] = r.n;
    return counts;
  }

  /** Whether an admin has banned this user from re-joining the lobby. */
  private async isKicked(userId: number): Promise<boolean> {
    const row = await this.env.DRAFT_DB
      .prepare("SELECT 1 FROM kicked_users WHERE user_id=?")
      .bind(userId)
      .first();
    return row != null;
  }

  /** Single source of truth for the pick order, so the WS path and buildState can
   *  never compute a different picker/round count. (Review: order divergence.) */
  private orderedUserIds(participants: Participant[]): number[] {
    return participants
      .filter((p) => p.joined && p.draft_order != null)
      .sort((a, b) => a.draft_order! - b.draft_order!)
      .map((p) => p.user_id);
  }

  private orderFromState(state: DraftState): number[] {
    return this.orderedUserIds(state.participants);
  }

  async buildState(): Promise<DraftState> {
    const row = await getSettingsRow(this.env.DRAFT_DB);
    const s = parseSettings(row);
    const participants = await listParticipants(this.env.DRAFT_DB);
    const picks = await listPicks(this.env.DRAFT_DB);
    const order = this.orderedUserIds(participants);
    const cur = s.current_pick_no;
    const current_user_id = cur && order.length ? pickerForPickNo(cur, order, s.order_mode) : null;
    return {
      status: s.status,
      settings: {
        total_picks: s.total_picks,
        seconds_per_pick: s.seconds_per_pick,
        pos_count: s.pos_count,
        max_per_country: s.max_per_country,
        order_mode: s.order_mode,
      },
      participants,
      picks,
      current_pick_no: cur,
      current_user_id,
      timer_deadline: s.timer_deadline,
      round_no: cur && order.length ? roundForPickNo(cur, order.length) : null,
      server_now: Date.now(),
    };
  }

  broadcast(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    // Sending to a socket mid-close throws; without per-socket guards one such
    // socket would abort the loop (other clients miss the update) and propagate
    // the throw into the pick critical section. (Review M5.)
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data); } catch { /* socket closing; skip */ }
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    if (msg.t === "ping") return ws.send(JSON.stringify({ t: "pong" }));
    if (msg.t !== "pick") return;
    const att = ws.deserializeAttachment() as { userId: number; username: string };
    // The whole read-modify-write runs under the lock: the cold-cache `await
    // buildState()`/`getActivePlayers()` below release the DO input gate, so
    // without serialization two concurrent picks from the on-the-clock user could
    // both load `cache===undefined`, both pass the guards, and both apply. (C2.)
    await this.withLock(async () => {
      const state = this.cache ?? (this.cache = await this.buildState());
      const players = this.playerMap ?? (this.playerMap = new Map(
        (await getActivePlayers(this.env.DRAFT_DB)).map(p => [p.id, p])));
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
      try {
        await this.applyPick(state, order, player, att.userId, att.userId, att.username);
      } catch {
        // Durable write failed (e.g. the unique-player backstop): clients were NOT
        // advanced because we persist before broadcasting. Drop the stale cache.
        this.cache = undefined;
        ws.send(JSON.stringify({ t: "error", code: "pick_failed", message: "Pick could not be saved" }));
      }
    });
  }

  /**
   * Persist a pick durably FIRST, then commit it to the in-memory `state` and
   * broadcast. Persisting before broadcasting guarantees clients never see a pick
   * the database didn't record (which would make the board visibly rewind on the
   * next cache rebuild). If `persistPick` throws, the in-memory `state` is left
   * untouched and nothing is broadcast — the caller surfaces an error and the
   * caller-held lock keeps this read-modify-write atomic. (Review H1 + C2.)
   * Callers MUST perform all guards (status, turn ownership, eligibility, …) and
   * hold `withLock` before invoking this method.
   */
  private async applyPick(
    state: DraftState,
    order: number[],
    player: Player,
    forUserId: number,
    byUserId: number,
    byUsername: string
  ) {
    const overall = state.current_pick_no!;
    const pick: Pick = {
      overall_no: overall,
      round_no: roundForPickNo(overall, order.length),
      user_id: forUserId,
      player_id: player.id,
      picked_by_user_id: byUserId,
      picked_at: Date.now(),
    };
    const complete = isDraftComplete(state.picks.length + 1, order, state.settings.total_picks);
    const nextNo = complete ? null : overall + 1;
    const status = complete ? "complete" : "in_progress";
    const deadline = complete ? null : Date.now() + state.settings.seconds_per_pick * 1000;
    // ---- PERSIST FIRST (durable truth before any client sees the pick) ----
    await this.persistPick(pick, status, nextNo, deadline);
    // ---- Durable write committed: advance in-memory state + broadcast ----
    state.picks.push(pick);
    state.current_pick_no = nextNo;
    state.status = status;
    state.current_user_id = complete ? null : pickerForPickNo(nextNo!, order, state.settings.order_mode);
    state.round_no = complete ? null : roundForPickNo(nextNo!, order.length);
    state.timer_deadline = deadline;
    state.server_now = Date.now();
    this.broadcast({ t: "pick_made", pick, player, by_username: byUsername });
    this.broadcast({ t: "state", state });
    // ---- Best-effort alarm: the pick is already durable + broadcast, so an alarm
    // failure must NOT be reported as a failed pick (rehydrate re-arms from the
    // persisted timer_deadline on the next restart anyway). ----
    try {
      if (deadline) await this.ctx.storage.setAlarm(deadline); else await this.ctx.storage.deleteAlarm();
    } catch (e) {
      console.error("alarm update failed after pick persisted", e);
    }
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
