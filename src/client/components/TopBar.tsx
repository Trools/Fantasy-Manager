import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useDraft } from "../hooks/useDraft";
import CountdownTimer from "./CountdownTimer";
import Button from "./Button";

export default function TopBar() {
  const { user, logout } = useAuth();
  const { state, isMyTurn, connected } = useDraft();

  const currentPicker = state?.participants.find(
    (p) => p.user_id === state.current_user_id
  );

  const showTimer =
    state?.status === "in_progress" || state?.status === "paused";

  return (
    <header
      className={`
        sticky top-0 z-50 border-b border-[--color-border-default]
        ${isMyTurn ? "bg-[--color-accent-primary]/10" : "bg-[--color-bg-surface]"}
      `}
    >
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Draft info */}
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-lg font-bold text-[--color-text-primary] hover:text-[--color-accent-primary]"
            >
              WC 2026 Draft
            </Link>

            {state && (
              <div className="hidden sm:flex items-center gap-3 text-sm">
                {state.round_no && (
                  <span className="text-[--color-text-secondary]">
                    Round {state.round_no} of {state.settings.total_picks}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded bg-[--color-bg-elevated] text-[--color-text-muted] text-xs uppercase">
                  {state.settings.order_mode}
                </span>
              </div>
            )}
          </div>

          {/* Center: On the clock + Timer */}
          {showTimer && (
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div
                  className={`text-sm font-medium ${
                    isMyTurn
                      ? "text-[--color-accent-primary]"
                      : "text-[--color-text-secondary]"
                  }`}
                >
                  {isMyTurn ? "You're on the clock" : `On the clock: ${currentPicker?.username ?? "..."}`}
                </div>
              </div>
              <CountdownTimer deadline={state?.timer_deadline ?? null} />
            </div>
          )}

          {/* Right: Connection + User */}
          <div className="flex items-center gap-3">
            {/* Connection indicator */}
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-green-500" : "bg-red-500"
              }`}
              title={connected ? "Connected" : "Disconnected"}
            />

            {/* Admin link */}
            {user?.is_admin && (
              <Link
                to="/admin"
                className="text-sm text-[--color-text-secondary] hover:text-[--color-text-primary]"
              >
                Admin
              </Link>
            )}

            {/* User info */}
            <span className="text-sm text-[--color-text-secondary]">
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
        <div className="bg-amber-500/20 border-t border-amber-500/30 px-4 py-2 text-center text-sm text-amber-400">
          Draft paused — waiting for admin
        </div>
      )}

      {/* Reconnecting banner */}
      {!connected && (
        <div className="bg-red-500/20 border-t border-red-500/30 px-4 py-2 text-center text-sm text-red-400">
          Reconnecting...
        </div>
      )}
    </header>
  );
}
