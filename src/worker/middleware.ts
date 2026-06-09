import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verifySession } from "../shared/crypto";
import { getUserById, type Env } from "./db";
import type { SessionClaims } from "../shared/types";

export const COOKIE = "wcd_session";

type AuthEnv = { Bindings: Env; Variables: { claims?: SessionClaims } };

export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE);
  const claims = token ? await verifySession(token, c.env.SESSION_SECRET) : null;
  if (!claims) return c.json({ error: "unauthenticated" }, 401);
  const user = await getUserById(c.env.DRAFT_DB, claims.userId);
  if (!user || user.token_version !== claims.tokenVersion) return c.json({ error: "session expired" }, 401);
  c.set("claims", claims);
  await next();
};

export const blockIfMustChange: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const claims = c.get("claims");
  if (claims?.mustChangePwd) return c.json({ error: "must_change_password" }, 403);
  await next();
};

export const requireAdmin: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (!c.get("claims")?.isAdmin) return c.json({ error: "forbidden" }, 403);
  await next();
};
