import type { OrderMode, Position, PosCounts, Player, Pick } from "./types";

const ALL_POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

/** Squad size = total players each manager drafts = sum of the per-position counts. */
export function sumPosCount(pc: PosCounts): number {
  return ALL_POSITIONS.reduce((a, p) => a + pc[p], 0);
}

export function roundForPickNo(pickNo: number, n: number): number {
  return Math.floor((pickNo - 1) / n) + 1;
}

export function pickerForPickNo(pickNo: number, order: number[], mode: OrderMode): number {
  const n = order.length;
  const round = roundForPickNo(pickNo, n);
  const idxInRound = (pickNo - 1) % n; // 0-based
  const forward = mode === "linear" || round % 2 === 1;
  const idx = forward ? idxInRound : n - 1 - idxInRound;
  return order[idx]!;
}

export interface RosterEntry { position: Position; country_code: string; }
export interface EligResult { ok: boolean; reason?: string; }

/**
 * `ignoreCountryCap` is the admin deadlock-breaker: when a manager's remaining
 * required positions are all stranded behind `max_per_country`, an admin can
 * force a pick that relaxes ONLY the country cap. The position-count limit is
 * always enforced so a forced pick can never produce an oversized squad.
 */
export function eligibility(
  pos: Position, countryCode: string, roster: RosterEntry[],
  s: { pos_count: PosCounts; max_per_country: number },
  opts?: { ignoreCountryCap?: boolean }
): EligResult {
  const counts: PosCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  let fromCountry = 0;
  for (const e of roster) { counts[e.position]++; if (e.country_code === countryCode) fromCountry++; }
  if (counts[pos] >= s.pos_count[pos]) return { ok: false, reason: `${pos} full` };
  if (!opts?.ignoreCountryCap && fromCountry >= s.max_per_country) return { ok: false, reason: `Max from ${countryCode}` };
  return { ok: true };
}

export function rosterFromPicks(picks: Pick[], players: Map<number, Player>, userId: number): RosterEntry[] {
  const roster: RosterEntry[] = [];
  for (const p of picks) {
    if (p.user_id !== userId) continue;
    // Tolerate a pick whose player row is missing (e.g. after a destructive
    // re-seed reassigned ids) rather than throwing and crashing the room.
    const pl = players.get(p.player_id);
    if (pl) roster.push({ position: pl.position, country_code: pl.country_code });
  }
  return roster;
}

export function validateSettings(s: { pos_count: PosCounts; max_per_country: number }): string[] {
  const errs: string[] = [];
  for (const p of ALL_POSITIONS) {
    const n = s.pos_count[p];
    if (!Number.isInteger(n) || n < 0) errs.push(`${p} count must be a non-negative whole number`);
  }
  if (sumPosCount(s.pos_count) < 1) errs.push("squad must have at least 1 player");
  if (!Number.isInteger(s.max_per_country) || s.max_per_country < 1) errs.push("max_per_country must be at least 1");
  return errs;
}

export function isDraftComplete(pickCount: number, participantIds: number[], totalPicks: number): boolean {
  return pickCount >= participantIds.length * totalPicks;
}

/**
 * Positions whose total demand (managers × required-per-squad) exceeds the
 * available active pool. A non-empty result means the draft is mathematically
 * impossible to complete and must be rejected at `start` rather than allowed to
 * deadlock mid-game. (See review C1/H5.)
 */
export function infeasiblePositions(
  posCount: PosCounts, managerCount: number, pool: PosCounts
): { position: Position; need: number; have: number }[] {
  const out: { position: Position; need: number; have: number }[] = [];
  for (const p of ALL_POSITIONS) {
    const need = posCount[p] * managerCount;
    if (need > pool[p]) out.push({ position: p, need, have: pool[p] });
  }
  return out;
}
