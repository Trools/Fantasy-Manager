import type { Env } from "./db";

/**
 * Call a DraftRoom DO command, forwarding the requesting user's session token so
 * the DO can authenticate (and, for non-`refresh` commands, authorize) the call.
 */
export function callDO(env: Env, cmd: string, token: string, body?: unknown): Promise<Response> {
  const id = env.DRAFT_ROOM.idFromName("main");
  // Pass the token via an internal header so it never appears in the DO URL. (M13.)
  return env.DRAFT_ROOM.get(id).fetch(`https://do/cmd/${cmd}`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Session-Token": token },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
