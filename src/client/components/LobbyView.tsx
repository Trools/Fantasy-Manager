import { useDraft } from "../hooks/useDraft";
import { useAuth } from "../hooks/useAuth";
import type { Position } from "../../shared/types";

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

// Position colors mirrored from the Claude design reference (GK amber, DEF blue, MID green, FWD orange).
const POS_STYLE: Record<Position, { fg: string; bg: string; bd: string }> = {
  GK: { fg: "#FBBF24", bg: "rgba(251,191,36,0.16)", bd: "rgba(251,191,36,0.45)" },
  DEF: { fg: "#6AA8FF", bg: "rgba(59,130,246,0.16)", bd: "rgba(59,130,246,0.45)" },
  MID: { fg: "#34D399", bg: "rgba(16,185,129,0.16)", bd: "rgba(16,185,129,0.45)" },
  FWD: { fg: "#FB8359", bg: "rgba(244,96,46,0.18)", bd: "rgba(244,96,46,0.5)" },
};

// Deterministic avatar color per username, from the design's accent palette.
const AVATAR_COLORS = ["#F59E0B", "#FF3D7F", "#6AA8FF", "#34D399", "#A78BFA", "#22D3EE", "#FB8359"];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length] ?? "#FF3D7F";
}

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
    <div className="mx-auto max-w-[1180px] px-7 pb-16 pt-2">
      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[360px_1fr]">
        {/* PARTICIPANTS */}
        <div className="rounded-[18px] border border-white/[0.07] bg-[#11161F] p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-(color:--color-text-muted)">
              Players
            </span>
            <span className="text-xs font-bold text-[#C7D0DC]">
              {participants.length} of 4–8
            </span>
          </div>

          <div className="flex flex-col gap-[9px]">
            {sortedParticipants.length > 0 ? (
              sortedParticipants.map((p) => {
                const you = p.user_id === user?.id;
                return (
                  <div
                    key={p.user_id}
                    className="flex items-center gap-3 rounded-[13px] border px-[13px] py-[11px]"
                    style={{
                      background: you ? "rgba(34,211,238,0.05)" : "rgba(255,255,255,0.02)",
                      borderColor: you ? "rgba(34,211,238,0.22)" : "rgba(255,255,255,0.06)",
                    }}
                  >
                    {/* Order badge */}
                    {p.draft_order !== null && (
                      <span
                        className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px] text-xs font-black"
                        style={{
                          background: "rgba(255,61,127,0.14)",
                          border: "1px solid rgba(255,61,127,0.4)",
                          color: "#FF6FA1",
                        }}
                      >
                        {p.draft_order}
                      </span>
                    )}

                    {/* Avatar + online dot */}
                    <span className="relative flex-none">
                      <span
                        className="block h-9 w-9 rounded-full text-center text-[15px] font-black leading-9 text-[#0A0E16]"
                        style={{ background: avatarColor(p.username) }}
                      >
                        {p.username.charAt(0).toUpperCase()}
                      </span>
                      <span
                        className="absolute -bottom-px -right-px h-[11px] w-[11px] rounded-full"
                        style={{
                          background: p.joined ? "#34D399" : "#5A6575",
                          border: "2px solid #11161F",
                        }}
                      />
                    </span>

                    {/* Name */}
                    <span className="flex-1 text-[15px] font-bold text-(color:--color-text-primary)">
                      {p.username}
                    </span>

                    {/* Tags */}
                    {you && (
                      <span
                        className="rounded-[6px] px-[7px] py-[5px] text-[9px] font-extrabold tracking-[0.08em]"
                        style={{
                          color: "#22D3EE",
                          background: "rgba(34,211,238,0.10)",
                          border: "1px solid rgba(34,211,238,0.3)",
                        }}
                      >
                        YOU
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="rounded-[11px] border border-dashed border-white/10 p-4 text-center text-xs font-semibold text-(color:--color-text-muted)">
                Waiting for players to join...
              </div>
            )}
          </div>

          <div className="mt-3.5 rounded-[11px] border border-dashed border-white/10 p-2.5 text-center text-xs font-semibold leading-[1.4] text-(color:--color-text-muted)">
            {hasOrder
              ? "Order set — ready when the admin starts"
              : "Everyone's here. Randomize the order to begin."}
          </div>
        </div>

        {/* SETTINGS */}
        <div className="rounded-[18px] border border-white/[0.07] bg-[#11161F] px-6 py-[22px]">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-(color:--color-text-muted)">
              Draft settings
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#8A97A8]">
              <span
                className="h-[7px] w-[7px] animate-pulse rounded-full"
                style={{ background: "#22D3EE" }}
              />
              Live · set by admin
            </span>
          </div>
          <p className="m-0 mb-[18px] text-[12.5px] font-medium leading-[1.4] text-(color:--color-text-muted)">
            Current draft setup, kept in sync with the admin.
          </p>

          {/* Top row settings */}
          <div className="mb-[18px] grid grid-cols-3 gap-3.5">
            <div className="rounded-[13px] border border-white/[0.06] bg-white/[0.02] p-3.5">
              <div className="mb-2.5 text-[11px] font-bold text-(color:--color-text-secondary)">
                Rounds <span className="text-(color:--color-text-muted)">(picks each)</span>
              </div>
              <div className="text-center text-2xl font-black tabular-nums text-(color:--color-text-primary)">
                {settings.total_picks}
              </div>
            </div>
            <div className="rounded-[13px] border border-white/[0.06] bg-white/[0.02] p-3.5">
              <div className="mb-2.5 text-[11px] font-bold text-(color:--color-text-secondary)">
                Pick timer
              </div>
              <div className="text-center text-2xl font-black tabular-nums text-(color:--color-text-primary)">
                {settings.seconds_per_pick}s
              </div>
            </div>
            <div className="rounded-[13px] border border-white/[0.06] bg-white/[0.02] p-3.5">
              <div className="mb-2.5 text-[11px] font-bold text-(color:--color-text-secondary)">
                Max / country
              </div>
              <div className="text-center text-2xl font-black tabular-nums text-(color:--color-text-primary)">
                {settings.max_per_country}
              </div>
            </div>
          </div>

          {/* Position min/max grid */}
          <div className="mb-[18px] rounded-[13px] border border-white/[0.06] bg-white/[0.02] px-4 py-1.5">
            <div className="grid grid-cols-3 gap-2.5 border-b border-white/[0.06] pb-2.5 pt-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-(color:--color-text-muted)">
                Position
              </span>
              <span className="text-center text-[10px] font-bold uppercase tracking-[0.1em] text-(color:--color-text-muted)">
                Min
              </span>
              <span className="text-center text-[10px] font-bold uppercase tracking-[0.1em] text-(color:--color-text-muted)">
                Max
              </span>
            </div>
            {POSITIONS.map((pos) => {
              const s = POS_STYLE[pos];
              return (
                <div
                  key={pos}
                  className="grid grid-cols-3 items-center gap-2.5 border-b border-white/[0.04] py-[9px]"
                >
                  <span
                    className="justify-self-start rounded-[7px] px-2 py-[5px] text-xs font-extrabold tracking-[0.05em]"
                    style={{ background: s.bg, color: s.fg, border: `1px solid ${s.bd}` }}
                  >
                    {pos}
                  </span>
                  <span className="text-center text-[15px] font-extrabold tabular-nums text-(color:--color-text-primary)">
                    {settings.pos_min[pos]}
                  </span>
                  <span className="text-center text-[15px] font-extrabold tabular-nums text-(color:--color-text-primary)">
                    {settings.pos_max[pos]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Order mode */}
          <div className="mb-[18px] grid grid-cols-1 gap-3.5">
            <div className="rounded-[13px] border border-white/[0.06] bg-white/[0.02] p-3.5">
              <div className="mb-2.5 text-[11px] font-bold text-(color:--color-text-secondary)">
                Order mode
              </div>
              <div className="flex gap-1.5">
                {(["snake", "linear"] as const).map((mode) => {
                  const active = settings.order_mode === mode;
                  return (
                    <span
                      key={mode}
                      className="flex-1 rounded-[9px] py-2.5 text-center text-xs font-extrabold capitalize"
                      style={{
                        color: active ? "#0A0E16" : "#9AA7B8",
                        background: active ? "#FF3D7F" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${active ? "#FF3D7F" : "rgba(255,255,255,0.08)"}`,
                      }}
                    >
                      {mode === "snake" ? "↩ Snake" : "→ Linear"}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Status / waiting */}
          {hasOrder ? (
            <div
              className="mb-[18px] flex items-center gap-2.5 rounded-[13px] px-4 py-3.5 text-[13px] font-bold leading-none text-[#6EE7B7]"
              style={{
                background: "rgba(52,211,153,0.07)",
                border: "1px solid rgba(52,211,153,0.3)",
              }}
            >
              <span>✓</span>
              <span>Settings valid · order set · ready to start</span>
            </div>
          ) : (
            <div
              className="mb-[18px] flex items-center gap-2.5 rounded-[13px] px-4 py-3.5 text-[13px] font-bold leading-none text-(color:--color-accent-warning)"
              style={{
                background: "rgba(251,191,36,0.07)",
                border: "1px solid rgba(251,191,36,0.3)",
              }}
            >
              <span className="h-2 w-2 rounded-full bg-(--color-accent-warning)" />
              <span>Waiting for the admin to randomize the order.</span>
            </div>
          )}

          {/* Waiting / admin note */}
          {isAdmin ? (
            <div
              className="flex items-center justify-center gap-2.5 rounded-[12px] px-4 py-[15px] text-center text-[13px] font-bold leading-[1.4] text-(color:--color-text-secondary)"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              Use the Admin panel to configure settings and start the draft.
            </div>
          ) : (
            <div
              className="flex items-center justify-center gap-2.5 rounded-[12px] px-4 py-[15px] text-[13px] font-bold leading-none text-(color:--color-text-secondary)"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <span className="h-2 w-2 rounded-full bg-(--color-accent-warning)" />
              Waiting for the admin to start the draft…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
