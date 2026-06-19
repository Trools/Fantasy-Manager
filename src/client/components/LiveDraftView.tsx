import { useState } from "react";
import { useDraft } from "../hooks/useDraft";
import PlayerList from "./PlayerList";
import RosterPanel from "./RosterPanel";
import PickFeed from "./PickFeed";
import DraftBoard from "./DraftBoard";

type Tab = "players" | "roster" | "feed" | "board";

export default function LiveDraftView() {
  const { state, connected, error } = useDraft();
  const [mobileTab, setMobileTab] = useState<Tab>("players");

  if (!state) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-(color:--color-text-secondary)">
          {connected ? "Loading draft state..." : "Connecting..."}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-4rem)] flex flex-col bg-(--color-bg-primary)">
      {/* Transient pick error (e.g. "Already drafted") — cleared by the next snapshot. */}
      {connected && error && (
        <div
          className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-[11px] px-4 py-2.5 text-[13px] font-bold text-white shadow-lg"
          style={{ background: "rgba(255,90,77,0.95)" }}
          role="alert"
        >
          {error}
        </div>
      )}

      {/* ===== ROSTER STRIP (desktop) ===== */}
      <div
        className="hidden lg:block flex-shrink-0 px-7 py-4 border-b border-white/[0.06]"
        style={{ background: "#0C0A12" }}
      >
        <RosterPanel />
      </div>

      {/* ===== Mobile tabs ===== */}
      <div className="lg:hidden flex-shrink-0 border-b border-(color:--color-border-default) bg-(--color-bg-surface)">
        <div className="flex gap-1.5 p-3">
          {(["players", "roster", "feed", "board"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex-1 px-3 py-2.5 rounded-[9px] text-xs font-bold transition-colors ${
                mobileTab === tab
                  ? "bg-(--color-accent-primary) text-(color:--color-bg-primary)"
                  : "bg-white/[0.04] text-(color:--color-text-secondary) hover:text-(color:--color-text-primary)"
              }`}
            >
              {tab === "players" && "Players"}
              {tab === "roster" && "Roster"}
              {tab === "feed" && "Feed"}
              {tab === "board" && "Board"}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Desktop layout: list | feed rail ===== */}
      <div className="flex-1 hidden lg:flex overflow-hidden">
        {/* Center: available player list */}
        <div className="flex-1 min-w-0 px-6 py-5 overflow-hidden border-r border-white/[0.06]">
          <PlayerList />
        </div>

        {/* Right rail: pick feed */}
        <div
          className="w-[300px] flex-none px-[18px] py-[18px] overflow-y-auto"
          style={{ background: "#0C0A12" }}
        >
          <PickFeed />
        </div>
      </div>

      {/* ===== Mobile content ===== */}
      <div className="flex-1 lg:hidden overflow-hidden p-4">
        {mobileTab === "players" && <PlayerList />}
        {mobileTab === "roster" && (
          <div className="h-full overflow-y-auto">
            <RosterPanel />
          </div>
        )}
        {mobileTab === "feed" && (
          <div className="h-full overflow-y-auto">
            <PickFeed />
          </div>
        )}
        {mobileTab === "board" && (
          <div className="h-full overflow-auto">
            <DraftBoard />
          </div>
        )}
      </div>
    </div>
  );
}
