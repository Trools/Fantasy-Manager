import { useDraft } from "../hooks/useDraft";
import { useAuth } from "../hooks/useAuth";
import CountryFlag from "./CountryFlag";
import PositionBadge from "./PositionBadge";

export default function PickFeed() {
  const { state, playersById } = useDraft();
  const { user } = useAuth();

  if (!state) return null;

  // Get picks in reverse chronological order
  const recentPicks = [...state.picks].reverse().slice(0, 20);

  const participantsById = new Map(
    state.participants.map((p) => [p.user_id, p])
  );

  return (
    <div>
      <div className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-(color:--color-text-muted) mb-3.5">
        Pick feed
      </div>

      {recentPicks.length > 0 ? (
        <div className="flex flex-col gap-2">
          {recentPicks.map((pick) => {
            const player = playersById.get(pick.player_id);
            const picker = participantsById.get(pick.user_id);

            if (!player) return null;

            const isMine = pick.user_id === user?.id;

            return (
              <div
                key={pick.overall_no}
                className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-[10px] border ${
                  isMine
                    ? "bg-(--color-accent-primary)/[0.07] border-(--color-accent-primary)/20"
                    : "bg-white/[0.025] border-white/[0.06]"
                }`}
              >
                <CountryFlag countryCode={player.country_code} size="sm" />
                <PositionBadge position={player.position} size="sm" />
                <span className="text-[13px] font-bold text-(color:--color-text-primary) truncate flex-1 min-w-0">
                  {player.full_name}
                </span>
                <span
                  className={`text-[11px] font-semibold whitespace-nowrap flex-none ${
                    isMine
                      ? "text-(color:--color-accent-light)"
                      : "text-(color:--color-text-secondary)"
                  }`}
                >
                  {isMine ? "You" : picker?.username ?? "?"}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-sm text-(color:--color-text-muted)">
          No picks yet — the draft is about to begin.
        </div>
      )}
    </div>
  );
}
