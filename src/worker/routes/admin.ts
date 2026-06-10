import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { getSettingsRow, getUserById, type Env } from "../db";
import { COOKIE, requireAuth, requireAdmin } from "../middleware";
import { callDO } from "../do-client";
import { validateSettings, sumPosCount } from "../../shared/draft-logic";
import { hashPassword } from "../../shared/crypto";
import type { SessionClaims } from "../../shared/types";

export const adminRoutes = new Hono<{ Bindings: Env; Variables: { claims?: SessionClaims } }>();

/** Relay a DO command response (text + status) straight to the client. */
async function relay(r: Response): Promise<Response> {
  return new Response(await r.text(), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}

// 1. PUT /admin/settings — lobby only.
adminRoutes.put("/admin/settings", requireAuth, requireAdmin, async c => {
  const db = c.env.DRAFT_DB;
  const row = await getSettingsRow(db);
  if (row.status !== "lobby") return c.json({ error: "can only edit settings in the lobby" }, 409);

  const { seconds_per_pick, pos_count, max_per_country, order_mode } = await c.req.json();
  if (!Number.isInteger(seconds_per_pick) || seconds_per_pick < 5) return c.json({ error: "seconds_per_pick must be an integer of at least 5" }, 400);
  const errs = validateSettings({ pos_count, max_per_country });
  if (errs.length) return c.json({ error: errs.join("; ") }, 400);
  if (order_mode !== "snake" && order_mode !== "linear") return c.json({ error: "order_mode must be 'snake' or 'linear'" }, 400);

  // total_picks is derived from the squad composition.
  const total_picks = sumPosCount(pos_count);
  await db.prepare(
    "UPDATE draft_settings SET total_picks=?, seconds_per_pick=?, pos_count=?, max_per_country=?, order_mode=? WHERE id=1"
  ).bind(total_picks, seconds_per_pick, JSON.stringify(pos_count), max_per_country, order_mode).run();

  await callDO(c.env, "refresh", getCookie(c, COOKIE) ?? "");
  return c.json({ ok: true });
});

// 2. Draft control proxies — forward to the DO and relay its response/status.
adminRoutes.post("/admin/randomize", requireAuth, requireAdmin, async c =>
  relay(await callDO(c.env, "randomize", getCookie(c, COOKIE) ?? "")));

adminRoutes.post("/admin/start", requireAuth, requireAdmin, async c =>
  relay(await callDO(c.env, "start", getCookie(c, COOKIE) ?? "")));

adminRoutes.post("/admin/pause", requireAuth, requireAdmin, async c =>
  relay(await callDO(c.env, "pause", getCookie(c, COOKIE) ?? "")));

adminRoutes.post("/admin/resume", requireAuth, requireAdmin, async c =>
  relay(await callDO(c.env, "resume", getCookie(c, COOKIE) ?? "")));

adminRoutes.post("/admin/extend", requireAuth, requireAdmin, async c => {
  const body = await c.req.json().catch(() => ({}));
  const seconds = Number(body.seconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return c.json({ error: "seconds must be a positive number" }, 400);
  return relay(await callDO(c.env, "extend", getCookie(c, COOKIE) ?? "", { seconds }));
});

adminRoutes.post("/admin/undo", requireAuth, requireAdmin, async c =>
  relay(await callDO(c.env, "undo", getCookie(c, COOKIE) ?? "")));

adminRoutes.post("/admin/pick-on-behalf", requireAuth, requireAdmin, async c => {
  const body = await c.req.json().catch(() => ({}));
  return relay(await callDO(c.env, "pick-on-behalf", getCookie(c, COOKIE) ?? "", { player_id: Number(body.player_id) }));
});

// 3. GET /admin/users
adminRoutes.get("/admin/users", requireAuth, requireAdmin, async c => {
  const { results } = await c.env.DRAFT_DB.prepare(
    "SELECT id, username, is_admin FROM users ORDER BY username"
  ).all<{ id: number; username: string; is_admin: number }>();
  return c.json({ users: results.map(u => ({ id: u.id, username: u.username, is_admin: !!u.is_admin })) });
});

// 4. POST /admin/users/:id/reset-password
adminRoutes.post("/admin/users/:id/reset-password", requireAuth, requireAdmin, async c => {
  const db = c.env.DRAFT_DB;
  const id = Number(c.req.param("id"));
  if (!(await getUserById(db, id))) return c.json({ error: "user not found" }, 404);

  const row = await getSettingsRow(db);
  const temp_password: string = row.temp_password;
  const { hash, salt } = await hashPassword(temp_password);
  await db.prepare(
    "UPDATE users SET password_hash=?, password_salt=?, must_change_password=1, token_version=token_version+1 WHERE id=?"
  ).bind(hash, salt, id).run();
  return c.json({ ok: true, temp_password });
});

// 5. POST /admin/users/:id/promote
adminRoutes.post("/admin/users/:id/promote", requireAuth, requireAdmin, async c => {
  const db = c.env.DRAFT_DB;
  const id = Number(c.req.param("id"));
  if (!(await getUserById(db, id))) return c.json({ error: "user not found" }, 404);
  await db.prepare("UPDATE users SET is_admin=1 WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});

// 6. POST /admin/users/:id/demote — guard against removing the last admin.
adminRoutes.post("/admin/users/:id/demote", requireAuth, requireAdmin, async c => {
  const db = c.env.DRAFT_DB;
  const id = Number(c.req.param("id"));
  const target = await getUserById(db, id);
  if (!target) return c.json({ error: "user not found" }, 404);

  // If the target is already a non-admin, nothing to do.
  if (!target.is_admin) return c.json({ ok: true });

  // Guard: cannot remove the last admin.
  const admins = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_admin=1").first<{ n: number }>();
  if ((admins?.n ?? 0) <= 1) return c.json({ error: "cannot demote the last admin" }, 409);

  await db.prepare("UPDATE users SET is_admin=0 WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});

// 7. POST /admin/participants/:id/kick — remove a participant from the lobby.
adminRoutes.post("/admin/participants/:id/kick", requireAuth, requireAdmin, async c => {
  const user_id = Number(c.req.param("id"));
  if (!Number.isInteger(user_id)) return c.json({ error: "invalid user id" }, 400);
  return relay(await callDO(c.env, "kick", getCookie(c, COOKIE) ?? "", { user_id }));
});

// 8. POST /admin/reset-draft — clear the draft to start fresh, keeping players.
adminRoutes.post("/admin/reset-draft", requireAuth, requireAdmin, async c => {
  const db = c.env.DRAFT_DB;
  await db.batch([
    db.prepare("DELETE FROM picks"),
    db.prepare("DELETE FROM participants"),
    db.prepare("UPDATE draft_settings SET status='lobby', current_pick_no=NULL, timer_deadline=NULL WHERE id=1"),
  ]);
  await callDO(c.env, "refresh", getCookie(c, COOKIE) ?? "");
  return c.json({ ok: true });
});
