import { useState, useEffect } from "react";
import type { DraftStatus } from "../../shared/types";

interface CountdownTimerProps {
  deadline: number | null;
  /** Draft status, so a paused clock reads "PAUSED" rather than "TIME!". */
  status?: DraftStatus;
  /** (serverClock − clientClock) ms, applied so the countdown ignores skew. */
  offsetMs?: number;
  urgentThreshold?: number; // seconds remaining when timer becomes "urgent"
}

type TimerState = "normal" | "urgent" | "expired" | "paused";

export default function CountdownTimer({
  deadline,
  status,
  offsetMs = 0,
  urgentThreshold = 10,
}: CountdownTimerProps) {
  const [remaining, setRemaining] = useState<number>(0);
  const [timerState, setTimerState] = useState<TimerState>("normal");

  const isPaused = status === "paused";

  useEffect(() => {
    if (isPaused) {
      setRemaining(0);
      setTimerState("paused");
      return;
    }
    if (deadline === null) {
      setRemaining(0);
      setTimerState("expired");
      return;
    }

    const deadlineMs = deadline;

    function tick() {
      // Use the server-aligned clock so a wrong device clock doesn't skew the count.
      const now = Date.now() + offsetMs;
      const diff = Math.max(0, Math.floor((deadlineMs - now) / 1000));
      setRemaining(diff);

      if (diff === 0) {
        setTimerState("expired");
      } else if (diff <= urgentThreshold) {
        setTimerState("urgent");
      } else {
        setTimerState("normal");
      }
    }

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [deadline, urgentThreshold, isPaused, offsetMs]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  const stateStyles: Record<TimerState, string> = {
    normal: "font-extrabold text-(color:--color-text-primary)",
    urgent: "font-black text-(color:--color-accent-urgent) animate-pulse",
    expired: "font-black text-(color:--color-text-muted)",
    paused: "font-black text-(color:--color-text-muted)",
  };

  const isSmall = timerState === "expired" || timerState === "paused";
  const label = timerState === "paused" ? "PAUSED" : timerState === "expired" ? "TIME!" : display;

  return (
    <div className="flex flex-col items-center">
      <span
        className={`
          font-sans tabular-nums leading-none tracking-[-0.02em]
          ${isSmall ? "text-3xl" : "text-5xl"}
          ${stateStyles[timerState]}
        `}
        style={
          timerState === "urgent"
            ? { textShadow: "0 0 20px rgba(255,90,77,0.5)" }
            : undefined
        }
      >
        {label}
      </span>
      {timerState === "urgent" && remaining > 0 && (
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-(color:--color-accent-urgent) mt-1.5">
          {remaining}s left
        </span>
      )}
    </div>
  );
}
