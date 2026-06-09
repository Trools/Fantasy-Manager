import { Hono } from "hono";
import type { Env } from "./db";
import { authRoutes } from "./routes/auth";
import { playerRoutes } from "./routes/players";
import { participantRoutes } from "./routes/participants";
export const app = new Hono<{ Bindings: Env; Variables: { claims?: import("../shared/types").SessionClaims } }>();
// Security headers (CSP) for all responses.
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("Content-Security-Policy",
    "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'");
  c.res.headers.set("X-Content-Type-Options", "nosniff");
});
app.get("/api/health", c => c.json({ ok: true }));
app.route("/api", authRoutes);
app.route("/api", playerRoutes);
app.route("/api", participantRoutes);
// WS5 attaches: app.route("/api", adminRoutes), etc.
export default app;
