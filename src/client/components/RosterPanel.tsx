import type { Position, Player } from "../../shared/types";
import { useDraft } from "../hooks/useDraft";
import PositionBadge from "./PositionBadge";
import CountryFlag from "./CountryFlag";

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

// Per-position fill color for the pip meter (matches the design system tokens)
const PIP_FILL: Record<Position, string> = {
  GK: "bg-(--color-pos-gk) border-(color:--color-pos-gk)",
  DEF: "bg-(--color-pos-def) border-(color:--color-pos-def)",
  MID: "bg-(--color-pos-mid) border-(color:--color-pos-mid)",
  FWD: "bg-(--color-pos-fwd) border-(color:--color-pos-fwd)",
};

export default function RosterPanel() {
  const { state, myRoster } = useDraft();

  if (!state) return null;

  const { pos_count } = state.settings;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {POSITIONS.map((pos) => {
        const players = myRoster.get(pos) ?? [];
        const count = players.length;
        const need = pos_count[pos];

        const isFull = count >= need;

        const cue = isFull ? "🔒 full" : `needs ${need - count}`;
        const cueColor = isFull
          ? "text-(color:--color-success)"
          : "text-(color:--color-pos-gk)";

        return (
          <div
            key={pos}
            className="bg-white/[0.02] border border-white/[0.07] rounded-[13px] p-3.5"
          >
            {/* Position header with count + cue */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <PositionBadge position={pos} size="sm" />
                <span className="text-sm font-medium text-(color:--color-text-secondary)">
                  {count} / {need}
                </span>
              </div>
              <span className={`text-xs font-bold ${cueColor}`}>{cue}</span>
            </div>

            {/* Pip meter — one segment per required slot */}
            <div className="flex gap-1 mb-2.5">
              {Array.from({ length: need }).map((_, i) => {
                const filled = i < count;
                return (
                  <span
                    key={i}
                    className={`flex-1 h-[7px] rounded-[3px] border ${
                      filled ? PIP_FILL[pos] : "bg-white/5 border-white/[0.08]"
                    }`}
                  />
                );
              })}
            </div>

            {/* Drafted players, or empty-slot note */}
            {players.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {players.map((player) => (
                  <RosterChip key={player.id} player={player} />
                ))}
              </div>
            ) : (
              <div className="text-xs font-medium text-(color:--color-pos-gk) bg-(--color-pos-gk)/[0.08] border border-dashed border-(--color-pos-gk)/30 px-2.5 py-2 rounded-lg">
                No {pos} yet — needs {need - count}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RosterChip({ player }: { player: Player }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-(color:--color-text-primary) bg-white/5 border border-white/[0.08] px-2 py-1.5 rounded-[7px] max-w-full">
      <CountryFlag countryCode={player.country_code} size="sm" />
      <span className="truncate">{player.full_name}</span>
    </span>
  );
}
