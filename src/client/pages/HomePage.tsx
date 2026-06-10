import { useDraft } from "../hooks/useDraft";
import TopBar from "../components/TopBar";
import LobbyView from "../components/LobbyView";
import LiveDraftView from "../components/LiveDraftView";
import CompleteView from "../components/CompleteView";

export default function HomePage() {
  const { state, connecting, error } = useDraft();

  const pageBg = {
    background:
      "radial-gradient(1100px 380px at 80% -140px, rgba(255,61,127,0.10), transparent 70%), #0A0E16",
  };

  // Connecting state
  if (connecting && !state) {
    return (
      <div className="min-h-screen bg-(--color-bg-primary)" style={pageBg}>
        <TopBar />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <div className="animate-spin w-9 h-9 border-[3px] border-(color:--color-accent-primary) border-t-transparent rounded-full mx-auto mb-5" />
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-(color:--color-accent-primary)">
              Connecting to draft
            </p>
            <p className="mt-2 text-sm text-(color:--color-text-muted)">
              Syncing the live draft state…
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !state) {
    return (
      <div className="min-h-screen bg-(--color-bg-primary)" style={pageBg}>
        <TopBar />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div
            className="text-center max-w-sm mx-auto px-6 py-6 rounded-2xl"
            style={{
              background: "rgba(255,90,77,0.07)",
              border: "1px solid rgba(255,90,77,0.30)",
            }}
          >
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-(color:--color-accent-urgent) mb-2">
              Connection lost
            </p>
            <p className="text-sm text-(color:--color-text-primary) mb-3">
              {error}
            </p>
            <p className="text-sm text-(color:--color-text-muted)">
              Trying to reconnect…
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render appropriate view based on status
  const renderView = () => {
    if (!state) return null;

    switch (state.status) {
      case "lobby":
        return <LobbyView />;
      case "in_progress":
      case "paused":
        return <LiveDraftView />;
      case "complete":
        return <CompleteView />;
      default:
        return <LobbyView />;
    }
  };

  return (
    <div className="min-h-screen bg-(--color-bg-primary)" style={pageBg}>
      <TopBar />
      {renderView()}
    </div>
  );
}
