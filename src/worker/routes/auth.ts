import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { hashPassword, verifyPassword, signSession, dummyVerify } from "../../shared/crypto";
import { getUserByUsername, getUserById, type Env } from "../db";
import { COOKIE, requireAuth } from "../middleware";
import type { SessionClaims } from "../../shared/types";

export const authRoutes = new Hono<{ Bindings: Env; Variables: { claims?: SessionClaims } }>();

const SESSION_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

function issue(_c: unknown, u: { id: number; username: string; is_admin: number; must_change_password: number; token_version: number }): SessionClaims {
  const now = Date.now();
  return {
    userId: u.id,
    username: u.username,
    isAdmin: !!u.is_admin,
    mustChangePwd: !!u.must_change_password,
    tokenVersion: u.token_version,
    iat: now,
    exp: now + SESSION_TTL_SEC * 1000,
  };
}

authRoutes.post("/register", async c => {
  const { username, password } = await c.req.json();
  if (!username || !password) return c.json({ error: "username and password required" }, 400);
  if (await getUserByUsername(c.env.DRAFT_DB, username)) return c.json({ error: "username taken" }, 409);
  const { hash, salt } = await hashPassword(password);
  const res = await c.env.DRAFT_DB.prepare(
    `INSERT INTO users (username,password_hash,password_salt,is_admin,created_at)
     SELECT ?,?,?, CASE WHEN (SELECT COUNT(*) FROM users)=0 THEN 1 ELSE 0 END, ?`)
    .bind(username, hash, salt, Date.now()).run();
  const u = await getUserById(c.env.DRAFT_DB, res.meta.last_row_id as number);
  const claims = issue(c, u!);
  setCookie(c, COOKIE, await signSession(claims, c.env.SESSION_SECRET), { httpOnly: true, sameSite: "Lax", path: "/", secure: true, maxAge: SESSION_TTL_SEC });
  return c.json({ user: { id: u!.id, username: u!.username, is_admin: !!u!.is_admin }, must_change_password: false });
});

authRoutes.post("/login", async c => {
  const { username, password } = await c.req.json();
  const u = await getUserByUsername(c.env.DRAFT_DB, username);
  if (!u) {
    // Burn the same PBKDF2 cost so timing can't distinguish a missing username
    // from a wrong password. (Review M15.)
    await dummyVerify(String(password ?? ""));
    return c.json({ error: "invalid credentials" }, 401);
  }
  if (!(await verifyPassword(password, u.password_hash, u.password_salt)))
    return c.json({ error: "invalid credentials" }, 401);
  const claims = issue(c, u);
  setCookie(c, COOKIE, await signSession(claims, c.env.SESSION_SECRET), { httpOnly: true, sameSite: "Lax", path: "/", secure: true, maxAge: SESSION_TTL_SEC });
  return c.json({ user: { id: u.id, username: u.username, is_admin: !!u.is_admin }, must_change_password: !!u.must_change_password });
});

authRoutes.post("/logout", c => {
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async c => {
  const cl = c.get("claims")!;
  return c.json({ user: { id: cl.userId, username: cl.username, is_admin: cl.isAdmin }, must_change_password: cl.mustChangePwd });
});

authRoutes.post("/change-password", requireAuth, async c => {
  const cl = c.get("claims")!;
  const { current_password, new_password } = await c.req.json();
  if (!new_password || new_password.length < 4) return c.json({ error: "password too short" }, 400);
  if (!cl.mustChangePwd) {
    // Voluntary change — require and verify the current password.
    if (!current_password) return c.json({ error: "current password incorrect" }, 401);
    const u = await getUserById(c.env.DRAFT_DB, cl.userId);
    if (!u || !(await verifyPassword(current_password, u.password_hash, u.password_salt)))
      return c.json({ error: "current password incorrect" }, 401);
  }
  const { hash, salt } = await hashPassword(new_password);
  await c.env.DRAFT_DB.prepare(
    "UPDATE users SET password_hash=?, password_salt=?, must_change_password=0, token_version=token_version+1 WHERE id=?")
    .bind(hash, salt, cl.userId).run();
  const u = await getUserById(c.env.DRAFT_DB, cl.userId);
  const claims = issue(c, u!);
  setCookie(c, COOKIE, await signSession(claims, c.env.SESSION_SECRET), { httpOnly: true, sameSite: "Lax", path: "/", secure: true, maxAge: SESSION_TTL_SEC });
  return c.json({ ok: true });
});
