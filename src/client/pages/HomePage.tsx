import { useDraft } from "../hooks/useDraft";
import TopBar from "../components/TopBar";
import LobbyView from "../components/LobbyView";
import LiveDraftView from "../components/LiveDraftView";
import CompleteView from "../components/CompleteView";

export default function HomePage() {
  const { state, connecting, error } = useDraft();

  // Connecting state
  if (connecting && !state) {
    return (
      <div className="min-h-screen bg-(--color-bg-primary)">
        <TopBar />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-(color:--color-accent-primary) border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-(color:--color-text-secondary)">
              Connecting to draft...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !state) {
    return (
      <div className="min-h-screen bg-(--color-bg-primary)">
        <TopBar />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <p className="text-(color:--color-accent-urgent) mb-2">{error}</p>
            <p className="text-(color:--color-text-secondary)">
              Trying to reconnect...
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
    <div className="min-h-screen bg-(--color-bg-primary)">
      <TopBar />
      {renderView()}
    </div>
  );
}
