import app from "./router";
import type { Env } from "./db";
export { DraftRoom } from "./draft-room"; // implemented in WS4

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const id = env.DRAFT_ROOM.idFromName("main");
      return env.DRAFT_ROOM.get(id).fetch(req);
    }
    if (url.pathname.startsWith("/api/")) return app.fetch(req, env, ctx);
    return env.ASSETS.fetch(req); // SPA static assets
  },
};
