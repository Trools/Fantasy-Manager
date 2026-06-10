import { useDraft } from "../hooks/useDraft";
import CountryFlag from "./CountryFlag";
import PositionBadge from "./PositionBadge";

export default function DraftBoard() {
  const { state, playersById } = useDraft();

  if (!state) return null;

  const { settings, participants, picks } = state;
  const totalRounds = settings.total_picks;
  const isSnake = settings.order_mode === "snake";

  // Sort participants by draft order
  const sortedParticipants = [...participants]
    .filter((p) => p.draft_order !== null)
    .sort((a, b) => (a.draft_order ?? 0) - (b.draft_order ?? 0));

  // Build the board: rounds × participants
  const board: (typeof picks[0] | null)[][] = [];
  for (let round = 1; round <= totalRounds; round++) {
    const row: (typeof picks[0] | null)[] = [];
    const isReversed = isSnake && round % 2 === 0;
    const orderedParticipants = isReversed
      ? [...sortedParticipants].reverse()
      : sortedParticipants;

    for (const participant of orderedParticipants) {
      const pick = picks.find(
        (p) => p.round_no === round && p.user_id === participant.user_id
      );
      row.push(pick ?? null);
    }

    board.push(row);
  }

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
                {row.map((pick, colIdx) => {
                  const isCurrent =
                    state.round_no === round &&
                    pick === null &&
                    colIdx === row.findIndex((p) => p === null);

                  return (
                    <td
                      key={colIdx}
                      className={`
                        px-2 py-1.5 text-center border-b border-white/[0.05]
                        ${isCurrent ? "bg-(--color-accent-primary)/15 ring-2 ring-(color:--color-accent-primary)/60 ring-inset" : ""}
                      `}
                    >
                      {pick ? (
                        <BoardCell pick={pick} playersById={playersById} />
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

function BoardCell({
  pick,
  playersById,
}: {
  pick: { player_id: number };
  playersById: Map<number, { country_code: string; position: string; full_name: string }>;
}) {
  const player = playersById.get(pick.player_id);
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
}
