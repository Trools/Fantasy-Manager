import { useDraft } from "../hooks/useDraft";
import { useAuth } from "../hooks/useAuth";
import type { Position } from "../../shared/types";

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

export default function LobbyView() {
  const { state, connected } = useDraft();
  const { user } = useAuth();

  if (!state) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-(color:--color-text-secondary)">
          {connected ? "Loading..." : "Connecting..."}
        </div>
      </div>
    );
  }

  const { settings, participants } = state;
  const isAdmin = user?.is_admin;
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.draft_order === null && b.draft_order === null) return 0;
    if (a.draft_order === null) return 1;
    if (b.draft_order === null) return -1;
    return a.draft_order - b.draft_order;
  });

  const hasOrder = participants.some((p) => p.draft_order !== null);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="grid gap-8 md:grid-cols-2">
        {/* Participants */}
        <div className="bg-(--color-bg-surface) rounded-lg border border-(color:--color-border-default) overflow-hidden">
          <div className="px-4 py-3 border-b border-(color:--color-border-default) flex items-center justify-between">
            <h2 className="font-semibold text-(color:--color-text-primary)">
              Participants
            </h2>
            <span className="text-sm text-(color:--color-text-secondary)">
              {participants.length} joined
            </span>
          </div>

          <div className="divide-y divide-(color:--color-border-muted)">
            {sortedParticipants.length > 0 ? (
              sortedParticipants.map((p) => (
                <div
                  key={p.user_id}
                  className="px-4 py-3 flex items-center gap-3"
                >
                  {/* Order badge */}
                  {p.draft_order !== null && (
                    <span className="w-6 h-6 rounded-full bg-(--color-accent-primary) text-gray-950 text-xs font-bold flex items-center justify-center">
                      {p.draft_order}
                    </span>
                  )}

                  {/* Name */}
                  <span className="text-(color:--color-text-primary) flex-1">
                    {p.username}
                  </span>

                  {/* Tags */}
                  <div className="flex gap-2">
                    {p.user_id === user?.id && (
                      <span className="text-xs px-2 py-0.5 rounded bg-(--color-accent-primary)/20 text-(color:--color-accent-primary)">
                        You
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-(color:--color-text-muted)">
                Waiting for players to join...
              </div>
            )}
          </div>

          {!hasOrder && (
            <div className="px-4 py-3 bg-(--color-bg-elevated) text-sm text-(color:--color-text-secondary)">
              Draft order will be randomized before start
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="bg-(--color-bg-surface) rounded-lg border border-(color:--color-border-default) overflow-hidden">
          <div className="px-4 py-3 border-b border-(color:--color-border-default) flex items-center justify-between">
            <h2 className="font-semibold text-(color:--color-text-primary)">
              Draft Settings
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          </div>

          <div className="p-4 space-y-4">
            {/* Basic settings */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-(color:--color-text-secondary)">Picks per person</span>
                <div className="text-(color:--color-text-primary) font-medium">
                  {settings.total_picks}
                </div>
              </div>
              <div>
                <span className="text-(color:--color-text-secondary)">Time per pick</span>
                <div className="text-(color:--color-text-primary) font-medium">
                  {settings.seconds_per_pick}s
                </div>
              </div>
              <div>
                <span className="text-(color:--color-text-secondary)">Order mode</span>
                <div className="text-(color:--color-text-primary) font-medium capitalize">
                  {settings.order_mode}
                </div>
              </div>
              <div>
                <span className="text-(color:--color-text-secondary)">Max per country</span>
                <div className="text-(color:--color-text-primary) font-medium">
                  {settings.max_per_country}
                </div>
              </div>
            </div>

            {/* Position constraints */}
            <div>
              <span className="text-sm text-(color:--color-text-secondary) block mb-2">
                Position requirements (min – max)
              </span>
              <div className="grid grid-cols-4 gap-2 text-sm">
                {POSITIONS.map((pos) => (
                  <div
                    key={pos}
                    className="bg-(--color-bg-elevated) rounded px-2 py-1.5 text-center"
                  >
                    <div className="text-(color:--color-text-muted) text-xs">{pos}</div>
                    <div className="text-(color:--color-text-primary) font-medium">
                      {settings.pos_min[pos]} – {settings.pos_max[pos]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {!isAdmin && (
            <div className="px-4 py-3 bg-(--color-bg-elevated) text-sm text-(color:--color-text-muted) text-center">
              Only the admin can change settings
            </div>
          )}
        </div>
      </div>

      {/* Status message */}
      <div className="mt-8 text-center">
        <p className="text-(color:--color-text-secondary)">
          {hasOrder
            ? "Waiting for admin to start the draft..."
            : "Waiting for admin to randomize order and start..."}
        </p>
        {isAdmin && (
          <p className="text-sm text-(color:--color-text-muted) mt-2">
            Use the Admin panel to configure settings and start the draft.
          </p>
        )}
      </div>
    </div>
  );
}
