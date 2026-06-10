import { useState } from "react";
import { useDraft } from "../hooks/useDraft";
import DraftBoard from "./DraftBoard";
import Button from "./Button";
import CountryFlag from "./CountryFlag";
import PositionBadge from "./PositionBadge";

export default function CompleteView() {
  const { state, playersById } = useDraft();
  const [copiedUser, setCopiedUser] = useState<number | null>(null);

  if (!state) return null;

  const { participants, picks } = state;

  const sortedParticipants = [...participants]
    .filter((p) => p.draft_order !== null)
    .sort((a, b) => (a.draft_order ?? 0) - (b.draft_order ?? 0));

  const picksByUser = new Map<number, typeof picks>();
  for (const pick of picks) {
    const list = picksByUser.get(pick.user_id) ?? [];
    list.push(pick);
    picksByUser.set(pick.user_id, list);
  }

  function formatUserPicks(userId: number): string {
    const userPicks = picksByUser.get(userId) ?? [];
    const participant = participants.find((p) => p.user_id === userId);
    const lines: string[] = [participant?.username ?? "Unknown", ""];

    for (const pick of userPicks.sort((a, b) => a.overall_no - b.overall_no)) {
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-[--color-text-primary] mb-2">
          Draft Complete!
        </h1>
        <p className="text-[--color-text-secondary]">
          {picks.length} players drafted by {participants.length} participants
        </p>
      </div>

      {/* Copy all button */}
      <div className="flex justify-center mb-8">
        <Button
          onClick={() => copyToClipboard(formatAllPicks())}
          variant={copiedUser === -1 ? "secondary" : "primary"}
        >
          {copiedUser === -1 ? "Copied!" : "Copy all results"}
        </Button>
      </div>

      {/* Draft board */}
      <div className="bg-[--color-bg-surface] rounded-lg border border-[--color-border-default] overflow-hidden mb-8">
        <div className="px-4 py-3 border-b border-[--color-border-default]">
          <h2 className="font-semibold text-[--color-text-primary]">
            Final Draft Board
          </h2>
        </div>
        <div className="p-4 overflow-auto">
          <DraftBoard />
        </div>
      </div>

      {/* Per-user results */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sortedParticipants.map((participant) => {
          const userPicks = picksByUser.get(participant.user_id) ?? [];
          const isCopied = copiedUser === participant.user_id;

          return (
            <div
              key={participant.user_id}
              className="bg-[--color-bg-surface] rounded-lg border border-[--color-border-default] overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[--color-border-default] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[--color-accent-primary] text-gray-950 text-xs font-bold flex items-center justify-center">
                    {participant.draft_order}
                  </span>
                  <h3 className="font-semibold text-[--color-text-primary]">
                    {participant.username}
                  </h3>
                </div>
                <Button
                  size="sm"
                  variant={isCopied ? "secondary" : "ghost"}
                  onClick={() =>
                    copyToClipboard(
                      formatUserPicks(participant.user_id),
                      participant.user_id
                    )
                  }
                >
                  {isCopied ? "Copied!" : "Copy"}
                </Button>
              </div>

              <div className="divide-y divide-[--color-border-muted]">
                {userPicks
                  .sort((a, b) => a.overall_no - b.overall_no)
                  .map((pick) => {
                    const player = playersById.get(pick.player_id);
                    if (!player) return null;

                    return (
                      <div
                        key={pick.overall_no}
                        className="px-4 py-2 flex items-center gap-2"
                      >
                        <CountryFlag
                          countryCode={player.country_code}
                          size="sm"
                        />
                        <PositionBadge position={player.position} size="sm" />
                        <span className="text-sm text-[--color-text-primary] truncate">
                          {player.full_name}
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
  );
}
