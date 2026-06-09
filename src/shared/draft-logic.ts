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
