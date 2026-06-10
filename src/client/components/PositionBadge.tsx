import type { Position } from "../../shared/types";

// Position colors from the Claude design system (GK amber, DEF blue, MID green, FWD orange)
const POSITION_COLORS: Record<Position, string> = {
  GK: "bg-(--color-pos-gk)/15 text-(color:--color-pos-gk) border-(color:--color-pos-gk)/45",
  DEF: "bg-(--color-pos-def)/15 text-(color:--color-pos-def) border-(color:--color-pos-def)/45",
  MID: "bg-(--color-pos-mid)/15 text-(color:--color-pos-mid) border-(color:--color-pos-mid)/45",
  FWD: "bg-(--color-pos-fwd)/20 text-(color:--color-pos-fwd) border-(color:--color-pos-fwd)/50",
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
