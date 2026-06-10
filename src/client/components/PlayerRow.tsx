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
    comfortable: "gap-3 px-3.5 py-3 rounded-[13px]",
    compact: "gap-2.5 px-2.5 py-2.5 rounded-[10px]",
    inline: "gap-2 px-2 py-1 rounded-lg",
  }[density];

  return (
    <div
      className={`
        flex items-center border transition-colors
        ${densityClasses}
        ${disabled
          ? "bg-white/[0.012] border-white/5 opacity-50 grayscale-[0.55]"
          : "bg-white/[0.028] border-white/[0.07] hover:bg-white/5"
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
        <div
          className={`
            font-bold truncate text-(color:--color-text-primary)
            ${density === "inline" ? "text-sm" : "text-base leading-tight"}
          `}
        >
          {player.full_name}
        </div>
        {showClub && player.club && density !== "inline" && (
          <div className="text-[12.5px] leading-tight text-(color:--color-text-secondary) truncate mt-0.5">
            {player.club}
            {player.shirt_number ? ` · #${player.shirt_number}` : ""}
          </div>
        )}
      </div>

      {/* Eligibility reason chip (ineligible players) */}
      {disabled && disabledReason && (
        <span className="flex-none whitespace-nowrap text-xs font-bold text-(color:--color-text-secondary) bg-white/5 border border-white/10 px-2.5 py-2 rounded-[9px]">
          {disabledReason}
        </span>
      )}

      {/* Action slot */}
      {action && <div className="flex-none">{action}</div>}
    </div>
  );
}
