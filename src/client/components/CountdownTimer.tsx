import { useState, useEffect } from "react";

interface CountdownTimerProps {
  deadline: number | null;
  urgentThreshold?: number; // seconds remaining when timer becomes "urgent"
}

type TimerState = "normal" | "urgent" | "expired";

export default function CountdownTimer({
  deadline,
  urgentThreshold = 10,
}: CountdownTimerProps) {
  const [remaining, setRemaining] = useState<number>(0);
  const [state, setState] = useState<TimerState>("normal");

  useEffect(() => {
    if (deadline === null) {
      setRemaining(0);
      setState("expired");
      return;
    }

    const deadlineMs = deadline;

    function tick() {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((deadlineMs - now) / 1000));
      setRemaining(diff);

      if (diff === 0) {
        setState("expired");
      } else if (diff <= urgentThreshold) {
        setState("urgent");
      } else {
        setState("normal");
      }
    }

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [deadline, urgentThreshold]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  const stateStyles: Record<TimerState, string> = {
    normal: "text-(color:--color-text-primary)",
    urgent: "text-(color:--color-accent-urgent) animate-pulse",
    expired: "text-(color:--color-text-muted)",
  };

  return (
    <div className="flex flex-col items-center">
      <span
        className={`
          font-mono font-bold text-4xl tabular-nums tracking-tight
          ${stateStyles[state]}
        `}
      >
        {state === "expired" ? "TIME!" : display}
      </span>
      {state === "urgent" && remaining > 0 && (
        <span className="text-xs text-(color:--color-accent-urgent) mt-1">
          {remaining} seconds left
        </span>
      )}
    </div>
  );
}
