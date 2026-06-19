import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
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
import { eligibility, rosterFromPicks, type RosterEntry } from "../../shared/draft-logic";
import { useAuth } from "./useAuth";
import * as api from "../utils/api";

interface DraftContextValue {
  state: DraftState | null;
  players: Player[];
  playersById: Map<number, Player>;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  /** Increments on every server error, even a repeat of the same message — lets
   *  consumers reliably react to a rejection (a plain `error` dep would not
   *  re-fire on an identical string). */
  errorNonce: number;
  /** Estimated (serverClock − clientClock) in ms, for skew-free countdowns. */
  serverOffset: number;
  kicked: boolean;
  rejoin: () => void;
  sendPick: (playerId: number) => void;
  isMyTurn: boolean;
  myPicks: Pick[];
  myRoster: Map<Position, Player[]>;
  availablePlayers: Player[];
  getEligibility: (player: Player) => { eligible: boolean; reason?: string };
}

const DraftContext = createContext<DraftContextValue | null>(null);

const MAX_RECONNECT_DELAY = 30_000;

export function DraftProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<DraftState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorNonce, setErrorNonce] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const [kicked, setKicked] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);
  const kickedRef = useRef(false);

  // Fetch players on mount
  useEffect(() => {
    api.getPlayers().then(setPlayers).catch(console.error);
  }, []);

  // Player lookup map — memoized so a pick broadcast doesn't rebuild a ~1200-entry
  // Map and invalidate every downstream memo. (Review O1.)
  const playersById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );

  const connect = useCallback(() => {
    setConnecting(true);
    setError(null);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
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
      // Ignore a stale socket's close (StrictMode remount, or rejoin() replacing
      // the socket): only the CURRENT socket drives reconnect/state. (Review M9.)
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setConnected(false);
      // Kicked by an admin: stay out until the user deliberately rejoins.
      if (kickedRef.current) return;
      // Exponential backoff with jitter, capped — no more flat 2s polling. (M10.)
      const attempt = reconnectAttemptsRef.current++;
      const delay = Math.min(MAX_RECONNECT_DELAY, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500);
      if (attempt >= 4) setError("Lost connection — still trying to reconnect…");
      reconnectTimeoutRef.current = window.setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // Let onclose own the reconnect/backoff; just tear this socket down.
      ws.close();
    };

    function handleMessage(msg: ServerMsg) {
      switch (msg.t) {
        case "state":
          setState(msg.state);
          // Re-estimate clock skew, but only commit a meaningfully different value
          // so the CountdownTimer's interval doesn't restart on every snapshot.
          setServerOffset((prev) => {
            const next = msg.state.server_now - Date.now();
            return Math.abs(next - prev) > 1000 ? next : prev;
          });
          // A fresh authoritative snapshot supersedes any transient pick error.
          setError(null);
          break;
        case "pick_made":
          // Authoritative removal is handled by `availablePlayers` (which filters
          // on state.picks). We intentionally do NOT mutate player.active here —
          // doing so left an undone pick's player invisible forever. (Review H4.)
          setError(null);
          break;
        case "timer":
          setState((prev) =>
            prev ? { ...prev, timer_deadline: msg.deadline } : prev
          );
          break;
        case "error":
          setError(msg.message);
          setErrorNonce((n) => n + 1);
          break;
        case "kicked":
          // Admin removed us from the lobby. The server closes the socket next; the
          // kickedRef flag stops onclose from auto-reconnecting until rejoin().
          kickedRef.current = true;
          setKicked(true);
          break;
        case "pong":
          // Keepalive response, ignore
          break;
      }
    }
  }, []);

  // Clear the kicked state and re-establish the connection (auto-join re-adds us).
  const rejoin = useCallback(() => {
    kickedRef.current = false;
    reconnectAttemptsRef.current = 0;
    setKicked(false);
    connect();
  }, [connect]);

  // WebSocket connection
  useEffect(() => {
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
      const ws = wsRef.current;
      if (ws) {
        // Detach handlers so this socket's onclose can't schedule a reconnect
        // after unmount. (Review M9.)
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        wsRef.current = null;
        ws.close();
      }
    };
  }, [connect]);

  const sendPick = useCallback((playerId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: ClientMsg = { t: "pick", player_id: playerId };
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // ---- Computed values (memoized so a pick broadcast re-renders cheaply) ----
  const isMyTurn = state?.current_user_id === user?.id;

  const myPicks = useMemo(
    () => state?.picks.filter((p) => p.user_id === user?.id) ?? [],
    [state, user?.id]
  );

  const myRoster = useMemo(() => {
    const m = new Map<Position, Player[]>();
    for (const pick of myPicks) {
      const player = playersById.get(pick.player_id);
      if (player) {
        const list = m.get(player.position) ?? [];
        list.push(player);
        m.set(player.position, list);
      }
    }
    return m;
  }, [myPicks, playersById]);

  // Available players (not yet drafted). `active` stays true for the whole pool;
  // the draft filter is authoritative and reverts correctly on undo. (Review H4.)
  const availablePlayers = useMemo(() => {
    const drafted = new Set(state?.picks.map((p) => p.player_id) ?? []);
    return players.filter((p) => p.active && !drafted.has(p.id));
  }, [players, state?.picks]);

  // The current user's roster entries, computed once per relevant change instead
  // of rebuilt for every player row inside getEligibility. (Review O2.)
  const myRosterEntries = useMemo<RosterEntry[]>(
    () => (state && user ? rosterFromPicks(state.picks, playersById, user.id) : []),
    [state, user, playersById]
  );

  // Eligibility check — delegates to the shared draft-logic rules.
  const getEligibility = useCallback(
    (player: Player): { eligible: boolean; reason?: string } => {
      if (!state || !user) return { eligible: false, reason: "Not connected" };
      const r = eligibility(player.position, player.country_code, myRosterEntries, state.settings);
      return { eligible: r.ok, reason: r.reason };
    },
    [state, user, myRosterEntries]
  );

  const value = useMemo<DraftContextValue>(
    () => ({
      state,
      players,
      playersById,
      connected,
      connecting,
      error,
      errorNonce,
      serverOffset,
      kicked,
      rejoin,
      sendPick,
      isMyTurn,
      myPicks,
      myRoster,
      availablePlayers,
      getEligibility,
    }),
    [
      state, players, playersById, connected, connecting, error, errorNonce, serverOffset,
      kicked, rejoin, sendPick, isMyTurn, myPicks, myRoster, availablePlayers, getEligibility,
    ]
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftContextValue {
  const context = useContext(DraftContext);
  if (!context) {
    throw new Error("useDraft must be used within a DraftProvider");
  }
  return context;
}
