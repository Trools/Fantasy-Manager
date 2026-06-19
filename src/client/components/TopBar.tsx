import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useDraft } from "../hooks/useDraft";
import CountdownTimer from "./CountdownTimer";
import Button from "./Button";

export default function TopBar() {
  const { user, logout } = useAuth();
  const { state, isMyTurn, connected, serverOffset } = useDraft();

  const currentPicker = state?.participants.find(
    (p) => p.user_id === state.current_user_id
  );

  const showTimer =
    state?.status === "in_progress" || state?.status === "paused";

  return (
    <header
      className={`
        sticky top-0 z-50 border-b
        ${
          isMyTurn
            ? "border-(--color-accent-primary)/30 bg-(--color-accent-primary)/8"
            : "border-(color:--color-border-default) bg-(--color-bg-surface)"
        }
      `}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Wordmark + Draft info */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Link to="/" className="flex items-center gap-2.5 group">
              <span
                className="inline-flex items-center justify-center w-9 h-9 rounded-[10px] text-white text-[11px] font-black leading-[0.9] text-center"
                style={{
                  background: "linear-gradient(140deg,#FF3D7F,#A01F4F)",
                  boxShadow: "0 6px 16px rgba(255,61,127,0.35)",
                }}
              >
                WC
                <br />
                26
              </span>
              <span className="hidden sm:block text-base font-black tracking-tight text-white group-hover:text-(color:--color-accent-primary) transition-colors">
                World Cup 2026 Draft
              </span>
            </Link>

            {state && (
              <div className="hidden md:flex items-center gap-2 text-sm">
                {state.round_no && (
                  <span className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-(color:--color-text-primary) text-xs font-bold">
                    Round {state.round_no}{" "}
                    <span className="text-(color:--color-text-muted) font-semibold">
                      / {state.settings.total_picks}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Center: On the clock + Timer */}
          {showTimer && (
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="hidden sm:flex flex-col items-end">
                <span
                  className={`text-[10px] font-bold uppercase tracking-[0.14em] mb-0.5 ${
                    isMyTurn
                      ? "text-(color:--color-accent-primary)"
                      : "text-(color:--color-text-muted)"
                  }`}
                >
                  {isMyTurn ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-(--color-accent-primary) animate-pulse" />
                      You're on the clock
                    </span>
                  ) : (
                    "On the clock"
                  )}
                </span>
                {!isMyTurn && (
                  <span className="text-sm font-extrabold text-(color:--color-text-primary)">
                    {currentPicker?.username ?? "..."}
                  </span>
                )}
              </div>
              <CountdownTimer
                deadline={state?.timer_deadline ?? null}
                status={state?.status}
                offsetMs={serverOffset}
              />
            </div>
          )}

          {/* Right: Connection + User */}
          <div className="flex items-center gap-3">
            {/* Connection indicator */}
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: connected
                  ? "var(--color-success)"
                  : "var(--color-accent-urgent)",
              }}
              title={connected ? "Connected" : "Disconnected"}
            />

            {/* Admin link */}
            {user?.is_admin && (
              <Link
                to="/admin"
                className="hidden sm:block text-sm font-semibold text-(color:--color-text-secondary) hover:text-(color:--color-text-primary) transition-colors"
              >
                Admin
              </Link>
            )}

            {/* User info */}
            <span className="hidden sm:block text-sm font-semibold text-(color:--color-text-secondary)">
              {user?.username}
            </span>

            <Button variant="ghost" size="sm" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Paused banner */}
      {state?.status === "paused" && (
        <div
          className="border-t px-4 py-2 text-center text-sm font-semibold text-(color:--color-accent-urgent)"
          style={{
            background: "rgba(255,90,77,0.08)",
            borderColor: "rgba(255,90,77,0.30)",
          }}
        >
          Draft paused — waiting for admin
        </div>
      )}

      {/* Reconnecting banner */}
      {!connected && (
        <div
          className="border-t px-4 py-2 text-center text-sm font-semibold text-(color:--color-accent-urgent)"
          style={{
            background: "rgba(255,90,77,0.12)",
            borderColor: "rgba(255,90,77,0.35)",
          }}
        >
          Reconnecting...
        </div>
      )}
    </header>
  );
}
