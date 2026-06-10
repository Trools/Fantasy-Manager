import { useDraft } from "../hooks/useDraft";
import CountryFlag from "./CountryFlag";
import PositionBadge from "./PositionBadge";

export default function PickFeed() {
  const { state, playersById } = useDraft();

  if (!state) return null;

  // Get picks in reverse chronological order
  const recentPicks = [...state.picks].reverse().slice(0, 20);

  const participantsById = new Map(
    state.participants.map((p) => [p.user_id, p])
  );

  return (
    <div className="bg-[--color-bg-surface] rounded-lg border border-[--color-border-default] overflow-hidden">
      <div className="px-4 py-3 border-b border-[--color-border-default]">
        <h2 className="font-semibold text-[--color-text-primary]">Live Feed</h2>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {recentPicks.length > 0 ? (
          <div className="divide-y divide-[--color-border-muted]">
            {recentPicks.map((pick) => {
              const player = playersById.get(pick.player_id);
              const picker = participantsById.get(pick.user_id);

              if (!player) return null;

              return (
                <div
                  key={pick.overall_no}
                  className="px-4 py-2 flex items-center gap-2"
                >
                  <span className="text-xs text-[--color-text-muted] w-6">
                    #{pick.overall_no}
                  </span>
                  <CountryFlag countryCode={player.country_code} size="sm" />
                  <PositionBadge position={player.position} size="sm" />
                  <span className="text-sm text-[--color-text-primary] truncate flex-1">
                    {player.full_name}
                  </span>
                  <span className="text-xs text-[--color-text-secondary]">
                    — {picker?.username ?? "?"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-[--color-text-muted]">
            No picks yet — the draft is about to begin.
          </div>
        )}
      </div>
    </div>
  );
}
