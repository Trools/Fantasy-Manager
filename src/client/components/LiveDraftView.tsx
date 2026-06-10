import { useState } from "react";
import { useDraft } from "../hooks/useDraft";
import PlayerList from "./PlayerList";
import RosterPanel from "./RosterPanel";
import PickFeed from "./PickFeed";
import DraftBoard from "./DraftBoard";

type Tab = "players" | "roster" | "feed" | "board";

export default function LiveDraftView() {
  const { state, connected } = useDraft();
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
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Mobile tabs */}
      <div className="lg:hidden flex-shrink-0 border-b border-(color:--color-border-default) bg-(--color-bg-surface)">
        <div className="flex">
          {(["players", "roster", "feed", "board"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === tab
                  ? "text-(color:--color-accent-primary) border-b-2 border-(color:--color-accent-primary)"
                  : "text-(color:--color-text-secondary) hover:text-(color:--color-text-primary)"
              }`}
            >
              {tab === "players" && "Players"}
              {tab === "roster" && "My Roster"}
              {tab === "feed" && "Feed"}
              {tab === "board" && "Board"}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop layout */}
      <div className="flex-1 hidden lg:flex overflow-hidden">
        {/* Main panel - Player list */}
        <div className="flex-1 p-4 overflow-hidden">
          <PlayerList />
        </div>

        {/* Right sidebar */}
        <div className="w-80 flex-shrink-0 border-l border-(color:--color-border-default) flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <RosterPanel />
            <PickFeed />
          </div>
        </div>
      </div>

      {/* Mobile content */}
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
