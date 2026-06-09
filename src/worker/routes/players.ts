import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { getActivePlayers, type Env } from "../db";
import { COOKIE, requireAuth, blockIfMustChange, requireAdmin } from "../middleware";
import { callDO } from "../do-client";
import type { SessionClaims } from "../../shared/types";

export const playerRoutes = new Hono<{ Bindings: Env; Variables: { claims?: SessionClaims } }>();

playerRoutes.get("/players", requireAuth, blockIfMustChange, async c =>
  c.json({ players: await getActivePlayers(c.env.DRAFT_DB) }));

playerRoutes.post("/players", requireAuth, requireAdmin, async c => {
  const p = await c.req.json();
  if (!p.country || !p.country_code || !["GK", "DEF", "MID", "FWD"].includes(p.position) || !p.full_name)
    return c.json({ error: "country, country_code, position(GK/DEF/MID/FWD), full_name required" }, 400);
  await c.env.DRAFT_DB.prepare(
    "INSERT INTO players (country,country_code,position,shirt_number,full_name,name_on_shirt,club,dob) VALUES (?,?,?,?,?,?,?,?)")
    .bind(p.country, p.country_code, p.position, p.shirt_number ?? null, p.full_name, p.name_on_shirt ?? null, p.club ?? null, p.dob ?? null).run();
  await callDO(c.env, "refresh", getCookie(c, COOKIE) ?? "");
  return c.json({ ok: true });
});

playerRoutes.put("/players/:id", requireAuth, requireAdmin, async c => {
  const id = Number(c.req.param("id"));
  const p = (await c.req.json()) as Record<string, unknown>;
  if (p.position && !["GK", "DEF", "MID", "FWD"].includes(p.position as string))
    return c.json({ error: "bad position" }, 400);
  // Update only provided fields among the allowed set.
  const fields = ["country", "country_code", "position", "shirt_number", "full_name", "name_on_shirt", "club", "dob", "active"];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of fields) if (f in p) { sets.push(`${f}=?`); vals.push(p[f]); }
  if (!sets.length) return c.json({ error: "no fields to update" }, 400);
  vals.push(id);
  await c.env.DRAFT_DB.prepare(`UPDATE players SET ${sets.join(",")} WHERE id=?`).bind(...vals).run();
  await callDO(c.env, "refresh", getCookie(c, COOKIE) ?? "");
  return c.json({ ok: true });
});

playerRoutes.delete("/players/:id", requireAuth, requireAdmin, async c => {
  const id = Number(c.req.param("id"));
  const drafted = await c.env.DRAFT_DB.prepare("SELECT 1 FROM picks WHERE player_id=?").bind(id).first();
  if (drafted) return c.json({ error: "player already drafted; disable instead of delete" }, 409);
  await c.env.DRAFT_DB.prepare("UPDATE players SET active=0 WHERE id=?").bind(id).run();
  await callDO(c.env, "refresh", getCookie(c, COOKIE) ?? "");
  return c.json({ ok: true });
});
