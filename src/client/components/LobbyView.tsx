import { useState } from "react";
import { useDraft } from "../hooks/useDraft";
import { useAuth } from "../hooks/useAuth";
import * as api from "../utils/api";
import { ApiError } from "../utils/api";
import DraftSettings from "./admin/DraftSettings";
import DraftControls from "./admin/DraftControls";

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
  const [kickBusy, setKickBusy] = useState<number | null>(null);
  const [kickError, setKickError] = useState<string | null>(null);

  async function handleKick(userId: number, username: string) {
    if (!window.confirm(`Remove ${username} from the lobby?`)) return;
    setKickBusy(userId);
    setKickError(null);
    try {
      await api.kickParticipant(userId);
    } catch (e) {
      setKickError(e instanceof ApiError ? e.message : "Failed to remove player");
    } finally {
      setKickBusy(null);
    }
  }

  if (!state) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-(color:--color-text-secondary)">
          {connected ? "Loading..." : "Connecting..."}
        </div>
      </div>
    );
  }

  const { participants } = state;
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

                    {/* Admin: kick from lobby */}
                    {isAdmin && !you && state.status === "lobby" && (
                      <button
                        type="button"
                        title={`Remove ${p.username} from the lobby`}
                        aria-label={`Remove ${p.username} from the lobby`}
                        disabled={kickBusy === p.user_id}
                        onClick={() => handleKick(p.user_id, p.username)}
                        className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px] text-[15px] font-black leading-none text-[#FF8A7A] transition-colors hover:bg-[rgba(255,90,77,0.12)] disabled:opacity-40"
                        style={{ border: "1px solid rgba(255,90,77,0.30)" }}
                      >
                        ×
                      </button>
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

          {kickError && (
            <div className="mt-3 rounded-[11px] border border-[rgba(255,90,77,0.32)] bg-[rgba(255,90,77,0.08)] px-3.5 py-2 text-[12px] font-semibold text-[#F4C7C1]">
              {kickError}
            </div>
          )}

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
              {isAdmin ? "Editable · you are admin" : "Live · set by admin"}
            </span>
          </div>
          <p className="m-0 mb-[18px] text-[12.5px] font-medium leading-[1.4] text-(color:--color-text-muted)">
            {isAdmin
              ? "Configure the draft, then randomize the order and start."
              : "Current draft setup, kept in sync with the admin."}
          </p>

          <DraftSettings editable={!!isAdmin && state.status === "lobby"} />

          {isAdmin && (
            <div className="mt-[18px] border-t border-white/[0.07] pt-[18px]">
              <DraftControls />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
