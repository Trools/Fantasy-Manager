import type { MeResponse, Player, PublicUser, ErrorResponse, Settings, AdminUser } from "../../shared/types";

const API_BASE = "/api";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as ErrorResponse;
    throw new ApiError(res.status, data.error || `Request failed: ${res.status}`);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

// Auth endpoints
export async function register(username: string, password: string): Promise<{ user: PublicUser }> {
  return request("/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string): Promise<{ user: PublicUser }> {
  return request("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function logout(): Promise<void> {
  return request("/logout", { method: "POST" });
}

export async function getMe(): Promise<MeResponse> {
  return request("/me");
}

export async function changePassword(newPassword: string): Promise<void> {
  return request("/change-password", {
    method: "POST",
    body: JSON.stringify({ new_password: newPassword }),
  });
}

// Player endpoints
export async function getPlayers(): Promise<Player[]> {
  const data = await request<{ players: Player[] }>("/players");
  return data.players;
}

// Admin endpoints (all require an admin session; backend enforces).
export async function updateSettings(settings: Settings): Promise<void> {
  return request("/admin/settings", { method: "PUT", body: JSON.stringify(settings) });
}
export async function randomizeOrder(): Promise<void> {
  return request("/admin/randomize", { method: "POST" });
}
export async function startDraft(): Promise<void> {
  return request("/admin/start", { method: "POST" });
}
export async function pauseDraft(): Promise<void> {
  return request("/admin/pause", { method: "POST" });
}
export async function resumeDraft(): Promise<void> {
  return request("/admin/resume", { method: "POST" });
}
export async function extendTimer(seconds: number): Promise<void> {
  return request("/admin/extend", { method: "POST", body: JSON.stringify({ seconds }) });
}
export async function undoPick(): Promise<void> {
  return request("/admin/undo", { method: "POST" });
}
/**
 * Admin records the on-the-clock pick (timeout resolution). `override` relaxes the
 * per-country cap to break a draft deadlocked behind max_per_country — the
 * position-count limit is still enforced. (Review H6.)
 */
export async function pickOnBehalf(playerId: number, override = false): Promise<void> {
  return request("/admin/pick-on-behalf", {
    method: "POST",
    body: JSON.stringify({ player_id: playerId, override }),
  });
}
export async function resetDraft(): Promise<void> {
  return request("/admin/reset-draft", { method: "POST" });
}
export async function kickParticipant(id: number): Promise<void> {
  return request(`/admin/participants/${id}/kick`, { method: "POST" });
}
export async function getUsers(): Promise<AdminUser[]> {
  const data = await request<{ users: AdminUser[] }>("/admin/users");
  return data.users;
}
export async function promoteUser(id: number): Promise<void> {
  return request(`/admin/users/${id}/promote`, { method: "POST" });
}
export async function demoteUser(id: number): Promise<void> {
  return request(`/admin/users/${id}/demote`, { method: "POST" });
}
export async function resetUserPassword(id: number): Promise<{ temp_password: string }> {
  return request(`/admin/users/${id}/reset-password`, { method: "POST" });
}

export { ApiError };
