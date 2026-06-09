import type { OrderMode, Position, PosCounts, Player, Pick } from "./types";

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

export function eligibility(
  pos: Position, countryCode: string, roster: RosterEntry[],
  s: { total_picks: number; pos_min: PosCounts; pos_max: PosCounts; max_per_country: number }
): EligResult {
  const counts: PosCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  let fromCountry = 0;
  for (const e of roster) { counts[e.position]++; if (e.country_code === countryCode) fromCountry++; }
  if (counts[pos] >= s.pos_max[pos]) return { ok: false, reason: `${pos} full` };
  if (fromCountry >= s.max_per_country) return { ok: false, reason: `Max from ${countryCode}` };
  const after: PosCounts = { ...counts, [pos]: counts[pos] + 1 };
  const remainingAfter = s.total_picks - (roster.length + 1);
  let unmet = 0;
  for (const p of ["GK", "DEF", "MID", "FWD"] as Position[]) unmet += Math.max(0, s.pos_min[p] - after[p]);
  if (unmet > remainingAfter) return { ok: false, reason: "would leave minimums unreachable" };
  return { ok: true };
}

export function rosterFromPicks(picks: Pick[], players: Map<number, Player>, userId: number): RosterEntry[] {
  return picks.filter(p => p.user_id === userId).map(p => {
    const pl = players.get(p.player_id)!;
    return { position: pl.position, country_code: pl.country_code };
  });
}

export function validateSettings(s: { total_picks: number; pos_min: PosCounts; pos_max: PosCounts; max_per_country: number }): string[] {
  const errs: string[] = [];
  const sumMin = (["GK","DEF","MID","FWD"] as Position[]).reduce((a,p)=>a+s.pos_min[p],0);
  const sumMax = (["GK","DEF","MID","FWD"] as Position[]).reduce((a,p)=>a+s.pos_max[p],0);
  if (s.total_picks < sumMin) errs.push(`total_picks must be at least the sum of minimums (${sumMin})`);
  if (s.total_picks > sumMax) errs.push(`total_picks must be at most the sum of maximums (${sumMax})`);
  for (const p of ["GK","DEF","MID","FWD"] as Position[]) if (s.pos_min[p] > s.pos_max[p]) errs.push(`${p} min exceeds max`);
  if (s.max_per_country < 1) errs.push("max_per_country must be at least 1");
  return errs;
}

export function isDraftComplete(pickCount: number, participantIds: number[], totalPicks: number): boolean {
  return pickCount >= participantIds.length * totalPicks;
}
