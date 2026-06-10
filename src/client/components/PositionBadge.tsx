import type { Position } from "../../shared/types";

const POSITION_COLORS: Record<Position, string> = {
  GK: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  DEF: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  MID: "bg-green-500/20 text-green-400 border-green-500/30",
  FWD: "bg-red-500/20 text-red-400 border-red-500/30",
};

interface PositionBadgeProps {
  position: Position;
  size?: "sm" | "md";
}

export default function PositionBadge({
  position,
  size = "md",
}: PositionBadgeProps) {
  const sizeClasses = size === "sm"
    ? "text-[10px] px-1.5 py-0.5"
    : "text-xs px-2 py-0.5";

  return (
    <span
      className={`
        inline-flex items-center justify-center font-semibold rounded border
        ${POSITION_COLORS[position]}
        ${sizeClasses}
      `}
      aria-label={position}
    >
      {position}
    </span>
  );
}
