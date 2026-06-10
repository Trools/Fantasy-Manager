import { useState, useMemo } from "react";
import type { Position, Player } from "../../shared/types";
import { useDraft } from "../hooks/useDraft";
import PlayerRow from "./PlayerRow";
import PositionBadge from "./PositionBadge";
import Button from "./Button";

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

type SortField = "rating" | "name" | "country" | "position" | "number";
type SortDir = "asc" | "desc";

export default function PlayerList() {
  const {
    availablePlayers,
    isMyTurn,
    sendPick,
    getEligibility,
    state,
    myRoster,
  } = useDraft();

  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<Position | null>(null);
  const [countryFilter, setCountryFilter] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("rating");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Get unique countries for filter dropdown
  const countries = useMemo(() => {
    const set = new Set(availablePlayers.map((p) => p.country));
    return Array.from(set).sort();
  }, [availablePlayers]);

  // Positions not yet filled to their exact count (used for the "FILLS" hint chip)
  const neededPositions = useMemo(() => {
    const needed = new Set<Position>();
    if (!state) return needed;
    for (const pos of POSITIONS) {
      const count = myRoster.get(pos)?.length ?? 0;
      if (count < state.settings.pos_count[pos]) needed.add(pos);
    }
    return needed;
  }, [state, myRoster]);

  // Filter and sort players
  const filteredPlayers = useMemo(() => {
    let result = availablePlayers;

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.full_name.toLowerCase().includes(q) ||
          p.club?.toLowerCase().includes(q) ||
          p.country.toLowerCase().includes(q)
      );
    }

    // Position filter
    if (posFilter) {
      result = result.filter((p) => p.position === posFilter);
    }

    // Country filter
    if (countryFilter) {
      result = result.filter((p) => p.country === countryFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "rating": {
          // Unrated players always sort last, regardless of direction.
          if (a.rating == null && b.rating == null) return 0;
          if (a.rating == null) return 1;
          if (b.rating == null) return -1;
          cmp = a.rating - b.rating;
          break;
        }
        case "name":
          cmp = a.full_name.localeCompare(b.full_name);
          break;
        case "country":
          cmp = a.country.localeCompare(b.country);
          break;
        case "position":
          cmp = POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position);
          break;
        case "number":
          cmp = (a.shirt_number ?? 99) - (b.shirt_number ?? 99);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [availablePlayers, search, posFilter, countryFilter, sortField, sortDir]);

  const clearFilters = () => {
    setSearch("");
    setPosFilter(null);
    setCountryFilter("");
  };

  const hasFilters = search || posFilter || countryFilter;

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="flex-shrink-0 space-y-4 pb-4">
        {/* Search + available count */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex-1 min-w-[180px] flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.09] rounded-[11px] px-3.5 py-3">
            <svg
              className="w-4 h-4 flex-none text-(color:--color-text-muted)"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or club…"
              className="w-full bg-transparent text-sm text-(color:--color-text-primary) placeholder-(--color-text-muted) focus:outline-none"
            />
          </div>
          <span className="flex-none text-xs font-bold text-(color:--color-info) bg-(--color-info)/10 border border-(--color-info)/30 px-3.5 py-3 rounded-[11px]">
            {filteredPlayers.length} available
          </span>
        </div>

        {/* Position pills + sort + country */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-2">
            {POSITIONS.map((pos) => {
              const active = posFilter === pos;
              return (
                <button
                  key={pos}
                  onClick={() => setPosFilter(active ? null : pos)}
                  className={`rounded-full transition-opacity ${
                    posFilter === null || active
                      ? "opacity-100"
                      : "opacity-40 hover:opacity-70"
                  }`}
                  aria-pressed={active}
                >
                  <span className="inline-flex">
                    <PositionBadge position={pos} />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Country select */}
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="px-3 py-2 rounded-full bg-white/5 border border-white/10
              text-xs font-bold text-(color:--color-text-primary)
              focus:outline-none focus:ring-2 focus:ring-(color:--color-accent-primary)/50"
          >
            <option value="" className="bg-(color:--color-bg-elevated) text-(color:--color-text-primary)">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c} className="bg-(color:--color-bg-elevated) text-(color:--color-text-primary)">
                {c}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={`${sortField}-${sortDir}`}
            onChange={(e) => {
              const [field, dir] = e.target.value.split("-") as [SortField, SortDir];
              setSortField(field);
              setSortDir(dir);
            }}
            className="ml-auto px-3 py-2 rounded-full bg-white/5 border border-white/10
              text-xs font-bold text-(color:--color-text-primary)
              focus:outline-none focus:ring-2 focus:ring-(color:--color-accent-primary)/50"
          >
            <option value="rating-desc" className="bg-(color:--color-bg-elevated) text-(color:--color-text-primary)">Sort: Ranking (best first)</option>
            <option value="rating-asc" className="bg-(color:--color-bg-elevated) text-(color:--color-text-primary)">Sort: Ranking (worst first)</option>
            <option value="name-asc" className="bg-(color:--color-bg-elevated) text-(color:--color-text-primary)">Sort: Name A–Z</option>
            <option value="name-desc" className="bg-(color:--color-bg-elevated) text-(color:--color-text-primary)">Sort: Name Z–A</option>
            <option value="country-asc" className="bg-(color:--color-bg-elevated) text-(color:--color-text-primary)">Sort: Country A–Z</option>
            <option value="position-asc" className="bg-(color:--color-bg-elevated) text-(color:--color-text-primary)">Sort: Position GK→FWD</option>
            <option value="number-asc" className="bg-(color:--color-bg-elevated) text-(color:--color-text-primary)">Sort: Number #1→</option>
          </select>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs font-bold uppercase tracking-wide text-(color:--color-text-secondary) underline underline-offset-2 hover:text-(color:--color-text-primary) transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Player list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
        {filteredPlayers.length > 0 ? (
          filteredPlayers.map((player) => (
            <PlayerListItem
              key={player.id}
              player={player}
              isMyTurn={isMyTurn}
              getEligibility={getEligibility}
              onDraft={sendPick}
              isDraftActive={state?.status === "in_progress"}
              fills={neededPositions.has(player.position)}
            />
          ))
        ) : (
          <div className="py-12 text-center">
            <p className="text-(color:--color-text-muted)">
              No available players match your filters
            </p>
            {hasFilters && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerListItem({
  player,
  isMyTurn,
  getEligibility,
  onDraft,
  isDraftActive,
  fills,
}: {
  player: Player;
  isMyTurn: boolean;
  getEligibility: (p: Player) => { eligible: boolean; reason?: string };
  onDraft: (playerId: number) => void;
  isDraftActive: boolean;
  fills: boolean;
}) {
  const { eligible, reason } = getEligibility(player);
  const canDraft = isMyTurn && eligible && isDraftActive;

  return (
    <PlayerRow
      player={player}
      disabled={!eligible}
      disabledReason={reason}
      action={
        isDraftActive && (
          <div className="flex items-center gap-2">
            {/* "Fills" hint — only when eligible, your turn, and this position is below its minimum */}
            {eligible && canDraft && fills && (
              <span className="flex-none whitespace-nowrap text-[10px] font-extrabold tracking-wide text-(color:--color-pos-gk) bg-(--color-pos-gk)/12 border border-(--color-pos-gk)/35 px-2.5 py-1.5 rounded-full">
                FILLS {player.position}
              </span>
            )}
            <Button
              size="sm"
              disabled={!canDraft}
              onClick={() => onDraft(player.id)}
            >
              Draft
            </Button>
          </div>
        )
      }
    />
  );
}
