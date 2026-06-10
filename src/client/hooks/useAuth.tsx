import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { PublicUser } from "../../shared/types";
import * as api from "../utils/api";

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  mustChangePassword: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.getMe();
      setUser(data.user);
      setMustChangePassword(data.must_change_password);
    } catch {
      setUser(null);
      setMustChangePassword(false);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.login(username, password);
    setUser(data.user);
    await refreshUser(); // Get full state including must_change_password
  }, [refreshUser]);

  const register = useCallback(async (username: string, password: string) => {
    const data = await api.register(username, password);
    setUser(data.user);
    setMustChangePassword(false);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setMustChangePassword(false);
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    await api.changePassword(newPassword);
    setMustChangePassword(false);
    await refreshUser();
  }, [refreshUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        mustChangePassword,
        login,
        register,
        logout,
        changePassword,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
