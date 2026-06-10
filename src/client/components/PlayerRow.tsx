import type { Player } from "../../shared/types";
import CountryFlag from "./CountryFlag";
import PositionBadge from "./PositionBadge";

interface PlayerRowProps {
  player: Player;
  action?: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  density?: "comfortable" | "compact" | "inline";
  showClub?: boolean;
}

export default function PlayerRow({
  player,
  action,
  disabled = false,
  disabledReason,
  density = "comfortable",
  showClub = true,
}: PlayerRowProps) {
  const densityClasses = {
    comfortable: "py-3 px-4",
    compact: "py-2 px-3",
    inline: "py-1 px-2",
  }[density];

  return (
    <div
      className={`
        flex items-center gap-3 rounded-lg transition-colors
        ${densityClasses}
        ${disabled
          ? "opacity-50 bg-transparent"
          : "bg-[--color-bg-surface] hover:bg-[--color-bg-hover]"
        }
      `}
    >
      {/* Flag */}
      <CountryFlag
        countryCode={player.country_code}
        countryName={player.country}
        size={density === "inline" ? "sm" : "md"}
      />

      {/* Position Badge */}
      <PositionBadge
        position={player.position}
        size={density === "inline" ? "sm" : "md"}
      />

      {/* Player Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`
              font-medium truncate
              ${density === "inline" ? "text-sm" : "text-base"}
              ${disabled ? "text-[--color-text-muted]" : "text-[--color-text-primary]"}
            `}
          >
            {player.full_name}
          </span>
          {player.shirt_number && density !== "inline" && (
            <span className="text-xs text-[--color-text-muted]">
              #{player.shirt_number}
            </span>
          )}
        </div>
        {showClub && player.club && density !== "inline" && (
          <div className="text-sm text-[--color-text-secondary] truncate">
            {player.club}
          </div>
        )}
        {disabled && disabledReason && (
          <div className="text-xs text-[--color-accent-urgent] mt-0.5">
            {disabledReason}
          </div>
        )}
      </div>

      {/* Action slot */}
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
