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
    normal: "font-extrabold text-(color:--color-text-primary)",
    urgent: "font-black text-(color:--color-accent-urgent) animate-pulse",
    expired: "font-black text-(color:--color-text-muted)",
  };

  return (
    <div className="flex flex-col items-center">
      <span
        className={`
          font-sans tabular-nums leading-none tracking-[-0.02em]
          ${state === "expired" ? "text-3xl" : "text-5xl"}
          ${stateStyles[state]}
        `}
        style={
          state === "urgent"
            ? { textShadow: "0 0 20px rgba(255,90,77,0.5)" }
            : undefined
        }
      >
        {state === "expired" ? "TIME!" : display}
      </span>
      {state === "urgent" && remaining > 0 && (
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-(color:--color-accent-urgent) mt-1.5">
          {remaining}s left
        </span>
      )}
    </div>
  );
}
