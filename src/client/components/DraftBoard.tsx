import { useMemo, memo } from "react";
import { useDraft } from "../hooks/useDraft";
import type { Participant, Pick } from "../../shared/types";
import CountryFlag from "./CountryFlag";
import PositionBadge from "./PositionBadge";

type Cell = { participant: Participant; pick: Pick | null };

export default function DraftBoard() {
  const { state, playersById } = useDraft();

  const sortedParticipants = useMemo(
    () =>
      (state?.participants ?? [])
        .filter((p) => p.draft_order !== null)
        .sort((a, b) => (a.draft_order ?? 0) - (b.draft_order ?? 0)),
    [state?.participants]
  );

  // Index picks by "round:user" so each board cell is an O(1) lookup instead of a
  // full picks scan (was O(rounds × participants × picks) per render). (Review O4.)
  const pickByCell = useMemo(() => {
    const m = new Map<string, Pick>();
    for (const p of state?.picks ?? []) m.set(`${p.round_no}:${p.user_id}`, p);
    return m;
  }, [state?.picks]);

  const isSnake = state?.settings.order_mode === "snake";
  const totalRounds = state?.settings.total_picks ?? 0;

  const board = useMemo(() => {
    const rows: Cell[][] = [];
    for (let round = 1; round <= totalRounds; round++) {
      const isReversed = isSnake && round % 2 === 0;
      const ordered = isReversed ? [...sortedParticipants].reverse() : sortedParticipants;
      rows.push(
        ordered.map((participant) => ({
          participant,
          pick: pickByCell.get(`${round}:${participant.user_id}`) ?? null,
        }))
      );
    }
    return rows;
  }, [totalRounds, isSnake, sortedParticipants, pickByCell]);

  if (!state) return null;

  // Only highlight the on-the-clock cell while the draft is actively running, so
  // the ring doesn't keep glowing during a pause. (Review: board-highlight-while-paused.)
  const liveRound = state.status === "in_progress" ? state.round_no : null;

  return (
    <div className="overflow-auto rounded-[13px] border border-white/[0.07] bg-white/[0.02]">
      <table className="w-full border-collapse min-w-max">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-(--color-bg-primary) px-3 py-2.5 text-left text-[11px] font-extrabold tracking-[0.12em] uppercase text-(color:--color-text-muted)">
              Round
            </th>
            {sortedParticipants.map((p) => (
              <th
                key={p.user_id}
                className="px-3 py-2.5 text-center text-[13px] font-bold text-(color:--color-text-secondary) border-b border-white/[0.06]"
              >
                {p.username}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {board.map((row, roundIdx) => {
            const round = roundIdx + 1;
            const isReversed = isSnake && round % 2 === 0;
            const currentCol =
              liveRound === round ? row.findIndex((c) => c.pick === null) : -1;

            return (
              <tr key={round} className={isReversed ? "bg-white/[0.015]" : ""}>
                <td className="sticky left-0 z-10 bg-(--color-bg-primary) px-3 py-2 text-sm font-medium text-(color:--color-text-muted) border-b border-white/[0.05]">
                  <div className="flex items-center gap-1">
                    {round}
                    {isSnake && (
                      <span className="text-xs text-(color:--color-info)">
                        {isReversed ? "←" : "→"}
                      </span>
                    )}
                  </div>
                </td>
                {row.map((cell, colIdx) => {
                  const isCurrent = colIdx === currentCol;
                  return (
                    <td
                      key={cell.participant.user_id}
                      className={`
                        px-2 py-1.5 text-center border-b border-white/[0.05]
                        ${isCurrent ? "bg-(--color-accent-primary)/15 ring-2 ring-(color:--color-accent-primary)/60 ring-inset" : ""}
                      `}
                    >
                      {cell.pick ? (
                        <BoardCell playerId={cell.pick.player_id} playersById={playersById} />
                      ) : (
                        <span className="text-(color:--color-text-muted)">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const BoardCell = memo(function BoardCell({
  playerId,
  playersById,
}: {
  playerId: number;
  playersById: Map<number, { country_code: string; position: string; full_name: string }>;
}) {
  const player = playersById.get(playerId);
  if (!player) return <span className="text-(color:--color-text-muted)">?</span>;

  return (
    <div className="flex items-center gap-1.5 justify-center">
      <CountryFlag countryCode={player.country_code} size="sm" />
      <PositionBadge position={player.position as "GK" | "DEF" | "MID" | "FWD"} size="sm" />
      <span className="text-xs text-(color:--color-text-primary) truncate max-w-[80px]">
        {player.full_name.split(" ").pop()}
      </span>
    </div>
  );
});
