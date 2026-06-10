import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type {
  DraftState,
  Player,
  ServerMsg,
  ClientMsg,
  Position,
  Pick,
} from "../../shared/types";
import { eligibility, rosterFromPicks } from "../../shared/draft-logic";
import { useAuth } from "./useAuth";
import * as api from "../utils/api";

interface DraftContextValue {
  state: DraftState | null;
  players: Player[];
  playersById: Map<number, Player>;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  sendPick: (playerId: number) => void;
  isMyTurn: boolean;
  myPicks: Pick[];
  myRoster: Map<Position, Player[]>;
  availablePlayers: Player[];
  getEligibility: (player: Player) => { eligible: boolean; reason?: string };
}

const DraftContext = createContext<DraftContextValue | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<DraftState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);

  // Fetch players on mount
  useEffect(() => {
    api.getPlayers().then(setPlayers).catch(console.error);
  }, []);

  // Player lookup map
  const playersById = new Map(players.map((p) => [p.id, p]));

  // WebSocket connection
  useEffect(() => {
    function connect() {
      setConnecting(true);
      setError(null);

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setConnecting(false);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMsg;
          handleMessage(msg);
        } catch (e) {
          console.error("Failed to parse WS message:", e);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // Reconnect after delay
        reconnectTimeoutRef.current = window.setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        setError("Connection error");
        ws.close();
      };
    }

    function handleMessage(msg: ServerMsg) {
      switch (msg.t) {
        case "state":
          setState(msg.state);
          break;
        case "pick_made":
          // Update players list to remove picked player
          setPlayers((prev) =>
            prev.map((p) =>
              p.id === msg.player.id ? { ...p, active: false } : p
            )
          );
          // State update will come via separate "state" message
          break;
        case "timer":
          setState((prev) =>
            prev ? { ...prev, timer_deadline: msg.deadline } : prev
          );
          break;
        case "error":
          setError(msg.message);
          break;
        case "pong":
          // Keepalive response, ignore
          break;
      }
    }

    connect();

    // Keepalive ping every 30s
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ t: "ping" } as ClientMsg));
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, []);

  const sendPick = useCallback((playerId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: ClientMsg = { t: "pick", player_id: playerId };
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Computed values
  const isMyTurn = state?.current_user_id === user?.id;

  const myPicks =
    state?.picks.filter((p) => p.user_id === user?.id) ?? [];

  const myRoster = new Map<Position, Player[]>();
  for (const pick of myPicks) {
    const player = playersById.get(pick.player_id);
    if (player) {
      const list = myRoster.get(player.position) ?? [];
      list.push(player);
      myRoster.set(player.position, list);
    }
  }

  // Available players (not yet drafted)
  const draftedPlayerIds = new Set(state?.picks.map((p) => p.player_id) ?? []);
  const availablePlayers = players.filter(
    (p) => p.active && !draftedPlayerIds.has(p.id)
  );

  // Eligibility check — delegates to the shared draft-logic rules.
  const getEligibility = useCallback(
    (player: Player): { eligible: boolean; reason?: string } => {
      if (!state || !user) return { eligible: false, reason: "Not connected" };
      const roster = rosterFromPicks(state.picks, playersById, user.id);
      const r = eligibility(player.position, player.country_code, roster, state.settings);
      return { eligible: r.ok, reason: r.reason };
    },
    [state, user, playersById]
  );

  return (
    <DraftContext.Provider
      value={{
        state,
        players,
        playersById,
        connected,
        connecting,
        error,
        sendPick,
        isMyTurn,
        myPicks,
        myRoster,
        availablePlayers,
        getEligibility,
      }}
    >
      {children}
    </DraftContext.Provider>
  );
}

export function useDraft(): DraftContextValue {
  const context = useContext(DraftContext);
  if (!context) {
    throw new Error("useDraft must be used within a DraftProvider");
  }
  return context;
}
