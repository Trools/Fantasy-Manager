import type { Env } from "./db";

/**
 * Call a DraftRoom DO command, forwarding the requesting user's session token so
 * the DO can authenticate (and, for non-`refresh` commands, authorize) the call.
 */
export function callDO(env: Env, cmd: string, token: string, body?: unknown): Promise<Response> {
  const u = new URL(`https://do/cmd/${cmd}`);
  u.searchParams.set("token", token);
  const id = env.DRAFT_ROOM.idFromName("main");
  return env.DRAFT_ROOM.get(id).fetch(new Request(u.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }));
}
