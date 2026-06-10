import type { MeResponse, Player, PublicUser, ErrorResponse } from "../../shared/types";

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

export { ApiError };
