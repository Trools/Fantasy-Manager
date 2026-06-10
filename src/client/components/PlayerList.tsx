import { useState, useMemo } from "react";
import type { Position, Player } from "../../shared/types";
import { useDraft } from "../hooks/useDraft";
import PlayerRow from "./PlayerRow";
import PositionBadge from "./PositionBadge";
import Button from "./Button";

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

type SortField = "name" | "country" | "position" | "number";
type SortDir = "asc" | "desc";

export default function PlayerList() {
  const { availablePlayers, isMyTurn, sendPick, getEligibility, state } =
    useDraft();

  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<Position | null>(null);
  const [countryFilter, setCountryFilter] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Get unique countries for filter dropdown
  const countries = useMemo(() => {
    const set = new Set(availablePlayers.map((p) => p.country));
    return Array.from(set).sort();
  }, [availablePlayers]);

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
      <div className="flex-shrink-0 space-y-3 pb-4">
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, club, or country..."
          className="w-full px-4 py-2.5 rounded-lg bg-[--color-bg-surface] border border-[--color-border-default]
            text-[--color-text-primary] placeholder-[--color-text-muted]
            focus:outline-none focus:ring-2 focus:ring-[--color-accent-primary]/50 focus:border-[--color-accent-primary]"
        />

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Position pills */}
          <div className="flex gap-1">
            {POSITIONS.map((pos) => (
              <button
                key={pos}
                onClick={() => setPosFilter(posFilter === pos ? null : pos)}
                className={`transition-opacity ${
                  posFilter === pos ? "opacity-100" : "opacity-50 hover:opacity-75"
                }`}
              >
                <PositionBadge position={pos} />
              </button>
            ))}
          </div>

          {/* Country select */}
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-[--color-bg-surface] border border-[--color-border-default]
              text-sm text-[--color-text-primary]
              focus:outline-none focus:ring-2 focus:ring-[--color-accent-primary]/50"
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
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
            className="px-3 py-1.5 rounded-lg bg-[--color-bg-surface] border border-[--color-border-default]
              text-sm text-[--color-text-primary]
              focus:outline-none focus:ring-2 focus:ring-[--color-accent-primary]/50"
          >
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="country-asc">Country A–Z</option>
            <option value="position-asc">Position GK→FWD</option>
            <option value="number-asc">Number #1→</option>
          </select>

          {/* Clear filters */}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Player count */}
      <div className="flex-shrink-0 text-sm text-[--color-text-secondary] pb-2">
        {filteredPlayers.length} players available
      </div>

      {/* Player list */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {filteredPlayers.length > 0 ? (
          filteredPlayers.map((player) => (
            <PlayerListItem
              key={player.id}
              player={player}
              isMyTurn={isMyTurn}
              getEligibility={getEligibility}
              onDraft={sendPick}
              isDraftActive={state?.status === "in_progress"}
            />
          ))
        ) : (
          <div className="py-12 text-center">
            <p className="text-[--color-text-muted]">
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
}: {
  player: Player;
  isMyTurn: boolean;
  getEligibility: (p: Player) => { eligible: boolean; reason?: string };
  onDraft: (playerId: number) => void;
  isDraftActive: boolean;
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
          <Button
            size="sm"
            disabled={!canDraft}
            onClick={() => onDraft(player.id)}
          >
            Draft
          </Button>
        )
      }
    />
  );
}
