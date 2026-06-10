import type { Position, Player } from "../../shared/types";
import { useDraft } from "../hooks/useDraft";
import PositionBadge from "./PositionBadge";
import CountryFlag from "./CountryFlag";

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

export default function RosterPanel() {
  const { state, myRoster } = useDraft();

  if (!state) return null;

  const { pos_min, pos_max } = state.settings;

  return (
    <div className="bg-(--color-bg-surface) rounded-lg border border-(color:--color-border-default) overflow-hidden">
      <div className="px-4 py-3 border-b border-(color:--color-border-default)">
        <h2 className="font-semibold text-(color:--color-text-primary)">Your Roster</h2>
      </div>

      <div className="divide-y divide-(color:--color-border-muted)">
        {POSITIONS.map((pos) => {
          const players = myRoster.get(pos) ?? [];
          const count = players.length;
          const min = pos_min[pos];
          const max = pos_max[pos];

          const isBelowMin = count < min;
          const isAtMax = count >= max;
          const isSatisfied = count >= min;

          return (
            <div key={pos} className="px-4 py-3">
              {/* Position header with meter */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <PositionBadge position={pos} size="sm" />
                  <span className="text-sm text-(color:--color-text-secondary)">
                    {count} / {min}–{max}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {isSatisfied && (
                    <svg
                      className="w-4 h-4 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {isAtMax && (
                    <svg
                      className="w-4 h-4 text-(color:--color-text-muted)"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </div>

              {/* Fill meter */}
              <div className="h-1.5 bg-(--color-bg-elevated) rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full transition-all ${
                    isBelowMin
                      ? "bg-amber-500"
                      : isAtMax
                      ? "bg-(--color-text-muted)"
                      : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(100, (count / max) * 100)}%` }}
                />
              </div>

              {/* Player list */}
              {players.length > 0 ? (
                <div className="space-y-1">
                  {players.map((player) => (
                    <RosterPlayer key={player.id} player={player} />
                  ))}
                </div>
              ) : (
                <div className="text-xs text-(color:--color-text-muted) italic">
                  No players drafted yet
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RosterPlayer({ player }: { player: Player }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <CountryFlag countryCode={player.country_code} size="sm" />
      <span className="text-sm text-(color:--color-text-primary) truncate">
        {player.full_name}
      </span>
    </div>
  );
}
