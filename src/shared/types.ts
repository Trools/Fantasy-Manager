export type Position = "GK" | "DEF" | "MID" | "FWD";
export type DraftStatus = "lobby" | "in_progress" | "paused" | "complete";
export type OrderMode = "snake" | "linear";
export type PosCounts = Record<Position, number>;

export interface Player {
  id: number; country: string; country_code: string; position: Position;
  shirt_number: number | null; full_name: string; name_on_shirt: string | null;
  club: string | null; dob: string | null; active: boolean;
}
export interface PublicUser { id: number; username: string; is_admin: boolean; }
export interface Participant { user_id: number; username: string; draft_order: number | null; joined: boolean; }
export interface Settings {
  total_picks: number; seconds_per_pick: number; pos_min: PosCounts; pos_max: PosCounts;
  max_per_country: number; order_mode: OrderMode;
}
export interface Pick {
  overall_no: number; round_no: number; user_id: number; player_id: number;
  picked_by_user_id: number; picked_at: number;
}
/** Full live snapshot the DO sends on connect and after every change. */
export interface DraftState {
  status: DraftStatus; settings: Settings; participants: Participant[];
  picks: Pick[]; current_pick_no: number | null; current_user_id: number | null;
  timer_deadline: number | null; round_no: number | null;
}

/** Session claims embedded in the signed cookie. */
export interface SessionClaims {
  userId: number; username: string; isAdmin: boolean;
  mustChangePwd: boolean; tokenVersion: number; iat: number;
}

/** ---- WebSocket protocol ---- */
export type ClientMsg =
  | { t: "pick"; player_id: number }
  | { t: "ping" };
export type ServerMsg =
  | { t: "state"; state: DraftState }            // full snapshot
  | { t: "pick_made"; pick: Pick; player: Player; by_username: string }
  | { t: "timer"; deadline: number | null }
  | { t: "error"; code: string; message: string }
  | { t: "pong" };

/** REST response shapes. */
export interface MeResponse { user: PublicUser | null; must_change_password: boolean; }
export interface ErrorResponse { error: string; }

export const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
