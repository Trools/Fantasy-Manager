import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { getSettingsRow, type Env } from "../db";
import { COOKIE, requireAuth, blockIfMustChange } from "../middleware";
import { callDO } from "../do-client";
import type { SessionClaims } from "../../shared/types";

export const participantRoutes = new Hono<{ Bindings: Env; Variables: { claims?: SessionClaims } }>();

participantRoutes.post("/participants/join", requireAuth, blockIfMustChange, async c => {
  const cl = c.get("claims")!;
  const row = await getSettingsRow(c.env.DRAFT_DB);
  if (row.status !== "lobby") return c.json({ error: "draft already started" }, 409);
  // A kicked user cannot re-join until an admin resets the draft. (Review H3.)
  const banned = await c.env.DRAFT_DB.prepare("SELECT 1 FROM kicked_users WHERE user_id=?").bind(cl.userId).first();
  if (banned) return c.json({ error: "you have been removed from this draft" }, 403);
  await c.env.DRAFT_DB.prepare("INSERT OR IGNORE INTO participants (user_id, joined) VALUES (?,1)").bind(cl.userId).run();
  await callDO(c.env, "refresh", getCookie(c, COOKIE) ?? "");
  return c.json({ ok: true });
});

participantRoutes.post("/participants/leave", requireAuth, blockIfMustChange, async c => {
  const cl = c.get("claims")!;
  const row = await getSettingsRow(c.env.DRAFT_DB);
  if (row.status !== "lobby") return c.json({ error: "draft already started" }, 409);
  await c.env.DRAFT_DB.prepare("DELETE FROM participants WHERE user_id=?").bind(cl.userId).run();
  await callDO(c.env, "refresh", getCookie(c, COOKIE) ?? "");
  return c.json({ ok: true });
});
