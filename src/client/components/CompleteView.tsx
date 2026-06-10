import { useState } from "react";
import { useDraft } from "../hooks/useDraft";
import DraftBoard from "./DraftBoard";
import Button from "./Button";
import CountryFlag from "./CountryFlag";
import PositionBadge from "./PositionBadge";
import type { Position } from "../../shared/types";

const POS_ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

export default function CompleteView() {
  const { state, playersById } = useDraft();
  const [copiedUser, setCopiedUser] = useState<number | null>(null);

  if (!state) return null;

  const { participants, picks, settings } = state;

  const sortedParticipants = [...participants]
    .filter((p) => p.draft_order !== null)
    .sort((a, b) => (a.draft_order ?? 0) - (b.draft_order ?? 0));

  const picksByUser = new Map<number, typeof picks>();
  for (const pick of picks) {
    const list = picksByUser.get(pick.user_id) ?? [];
    list.push(pick);
    picksByUser.set(pick.user_id, list);
  }

  function sortedUserPicks(userId: number) {
    const userPicks = [...(picksByUser.get(userId) ?? [])];
    return userPicks.sort((a, b) => {
      const pa = playersById.get(a.player_id);
      const pb = playersById.get(b.player_id);
      const da = pa ? POS_ORDER.indexOf(pa.position) : 99;
      const db = pb ? POS_ORDER.indexOf(pb.position) : 99;
      if (da !== db) return da - db;
      return a.overall_no - b.overall_no;
    });
  }

  function positionCounts(userId: number): string {
    const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const pick of picksByUser.get(userId) ?? []) {
      const player = playersById.get(pick.player_id);
      if (player) counts[player.position]++;
    }
    return POS_ORDER.map((pos) => `${counts[pos]} ${pos}`).join(" · ");
  }

  function formatUserPicks(userId: number): string {
    const participant = participants.find((p) => p.user_id === userId);
    const lines: string[] = [participant?.username ?? "Unknown", ""];

    for (const pick of sortedUserPicks(userId)) {
      const player = playersById.get(pick.player_id);
      if (player) {
        lines.push(`${player.country} · ${player.position} · ${player.full_name}`);
      }
    }

    return lines.join("\n");
  }

  function formatAllPicks(): string {
    const sections: string[] = [];

    for (const participant of sortedParticipants) {
      sections.push(formatUserPicks(participant.user_id));
    }

    return sections.join("\n\n---\n\n");
  }

  async function copyToClipboard(text: string, userId?: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUser(userId ?? -1);
      setTimeout(() => setCopiedUser(null), 2000);
    } catch {
      console.error("Failed to copy");
    }
  }

  const rounds = settings.total_picks;
  const orderLabel = settings.order_mode === "snake" ? "snake order" : "linear order";

  return (
    <div
      className="min-h-screen text-(color:--color-text-primary)"
      style={{
        background:
          "radial-gradient(1200px 420px at 50% -160px, rgba(255,61,127,0.12), transparent 70%), #0A0E16",
      }}
    >
      <div className="max-w-[1200px] mx-auto px-7 pt-8 pb-20">
        {/* HEADER */}
        <div className="flex items-end gap-[18px] flex-wrap mb-7">
          <div className="flex-1 min-w-[260px]">
            <div
              className="inline-flex items-center gap-[9px] px-[13px] py-[7px] rounded-full mb-3.5"
              style={{
                background: "rgba(52,211,153,0.10)",
                border: "1px solid rgba(52,211,153,0.3)",
              }}
            >
              <span className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-[#6EE7B7]">
                🏁 Draft complete
              </span>
            </div>
            <h1 className="text-[40px] leading-[1.02] font-black tracking-[-0.02em] text-white m-0">
              Every squad is set.
            </h1>
            <p className="text-[15px] leading-[1.5] font-medium text-(color:--color-text-secondary) mt-3 max-w-[560px]">
              {rounds} rounds · {orderLabel} · {participants.length} managers.
              Copy any squad straight into your scoring platform.
            </p>
          </div>
          <div className="flex gap-[11px]">
            <Button
              variant="primary"
              size="lg"
              onClick={() => copyToClipboard(formatAllPicks())}
            >
              {copiedUser === -1 ? "✓ Copied all results" : "⧉ Copy all results"}
            </Button>
          </div>
        </div>

        {/* BOARD */}
        <div
          className="rounded-[18px] p-4 mb-[30px] overflow-x-auto"
          style={{
            background: "#0E141D",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <DraftBoard />
        </div>

        {/* PER-USER CARDS */}
        <div className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-(color:--color-text-muted) mb-4">
          Squads &amp; copy
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sortedParticipants.map((participant) => {
            const userPicks = sortedUserPicks(participant.user_id);
            const isCopied = copiedUser === participant.user_id;

            return (
              <div
                key={participant.user_id}
                className="rounded-[16px] p-[18px]"
                style={{
                  background: "#11161F",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div className="flex items-center gap-[11px] mb-4">
                  <span className="w-[30px] h-[30px] rounded-full bg-(--color-accent-primary) text-(color:--color-bg-primary) text-sm font-black flex items-center justify-center flex-none">
                    {participant.username.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[17px] font-extrabold text-(color:--color-text-primary) truncate">
                      {participant.username}
                    </div>
                    <div className="text-[11px] font-semibold text-(color:--color-text-muted) mt-[3px]">
                      Pick #{participant.draft_order} ·{" "}
                      {positionCounts(participant.user_id)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      copyToClipboard(
                        formatUserPicks(participant.user_id),
                        participant.user_id
                      )
                    }
                  >
                    {isCopied ? "✓ Copied" : "⧉ Copy"}
                  </Button>
                </div>

                <div className="flex flex-col gap-1.5">
                  {userPicks.map((pick) => {
                    const player = playersById.get(pick.player_id);
                    if (!player) return null;

                    return (
                      <div
                        key={pick.overall_no}
                        className="flex items-center gap-2.5 px-[9px] py-[7px] rounded-[9px]"
                        style={{ background: "rgba(255,255,255,0.02)" }}
                      >
                        <CountryFlag
                          countryCode={player.country_code}
                          countryName={player.country}
                          size="md"
                        />
                        <PositionBadge position={player.position} size="sm" />
                        <span className="flex-1 min-w-0 text-sm font-bold text-(color:--color-text-primary) truncate">
                          {player.full_name}
                        </span>
                        <span className="flex-none text-[11px] font-medium text-(color:--color-text-muted)">
                          {player.country}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
