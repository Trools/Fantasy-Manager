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

  // Eligibility check
  const getEligibility = useCallback(
    (player: Player): { eligible: boolean; reason?: string } => {
      if (!state || !user) return { eligible: false, reason: "Not connected" };

      const settings = state.settings;
      const myRosterCount = new Map<Position, number>();
      const myCountryCount = new Map<string, number>();

      for (const pick of state.picks) {
        if (pick.user_id !== user.id) continue;
        const p = playersById.get(pick.player_id);
        if (p) {
          myRosterCount.set(p.position, (myRosterCount.get(p.position) ?? 0) + 1);
          myCountryCount.set(
            p.country_code,
            (myCountryCount.get(p.country_code) ?? 0) + 1
          );
        }
      }

      const posCount = myRosterCount.get(player.position) ?? 0;
      const countryCount = myCountryCount.get(player.country_code) ?? 0;

      // Check position max
      if (posCount >= settings.pos_max[player.position]) {
        return { eligible: false, reason: `${player.position} full` };
      }

      // Check country max
      if (countryCount >= settings.max_per_country) {
        return {
          eligible: false,
          reason: `Max ${player.country_code}`,
        };
      }

      // Forward feasibility check
      const currentTotal = myPicks.length;
      const remainingAfter = settings.total_picks - currentTotal - 1;

      // After adding this pick, check if we can still meet minimums
      const afterRoster = new Map(myRosterCount);
      afterRoster.set(
        player.position,
        (afterRoster.get(player.position) ?? 0) + 1
      );

      let minNeeded = 0;
      for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
        const have = afterRoster.get(pos) ?? 0;
        const need = settings.pos_min[pos];
        if (have < need) {
          minNeeded += need - have;
        }
      }

      if (minNeeded > remainingAfter) {
        const shortPos = (["GK", "DEF", "MID", "FWD"] as Position[]).find(
          (pos) => (afterRoster.get(pos) ?? 0) < settings.pos_min[pos]
        );
        return {
          eligible: false,
          reason: `Would leave ${shortPos} minimum unreachable`,
        };
      }

      return { eligible: true };
    },
    [state, user, myPicks, playersById]
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
