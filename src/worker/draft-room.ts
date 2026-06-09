// Temporary stub — replaced by the full Durable Object implementation in WS4.
import type { Env } from "./db";
export class DraftRoom {
  constructor(private ctx: DurableObjectState, private env: Env) {}
  async fetch(_req: Request): Promise<Response> {
    return new Response("DraftRoom not yet implemented", { status: 501 });
  }
}
