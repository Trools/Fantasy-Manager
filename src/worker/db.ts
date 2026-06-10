import type { Player, Settings, Participant, Pick, PosCounts, DraftStatus, OrderMode } from "../shared/types";
import { sumPosCount } from "../shared/draft-logic";

export interface Env {
  DRAFT_DB: D1Database;
  DRAFT_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
}

export interface UserRow {
  id: number; username: string; password_hash: string; password_salt: string;
  must_change_password: number; is_admin: number; token_version: number; created_at: number;
}

export async function getUserByUsername(db: D1Database, username: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first<UserRow>();
}
export async function getUserById(db: D1Database, id: number): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
}
export async function countUsers(db: D1Database): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
  return r?.n ?? 0;
}
export async function getSettingsRow(db: D1Database) {
  return db.prepare("SELECT * FROM draft_settings WHERE id = 1").first<any>();
}
export function parseSettings(row: any): Settings & { status: DraftStatus; current_pick_no: number | null; timer_deadline: number | null } {
  const pos_count = JSON.parse(row.pos_count) as PosCounts;
  return {
    total_picks: sumPosCount(pos_count), seconds_per_pick: row.seconds_per_pick,
    pos_count, max_per_country: row.max_per_country, order_mode: row.order_mode as OrderMode,
    status: row.status, current_pick_no: row.current_pick_no, timer_deadline: row.timer_deadline,
  };
}
export async function listParticipants(db: D1Database): Promise<Participant[]> {
  const { results } = await db.prepare(
    `SELECT p.user_id, u.username, p.draft_order, p.joined
     FROM participants p JOIN users u ON u.id = p.user_id ORDER BY p.draft_order, u.username`
  ).all<any>();
  return results.map(r => ({ user_id: r.user_id, username: r.username, draft_order: r.draft_order, joined: !!r.joined }));
}
export async function listPicks(db: D1Database): Promise<Pick[]> {
  const { results } = await db.prepare("SELECT * FROM picks ORDER BY overall_no").all<Pick>();
  return results;
}
export async function getActivePlayers(db: D1Database): Promise<Player[]> {
  const { results } = await db.prepare("SELECT * FROM players WHERE active = 1 ORDER BY country, position").all<any>();
  return results.map(r => ({ ...r, active: !!r.active })) as Player[];
}
