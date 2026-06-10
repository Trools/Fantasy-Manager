import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../hooks/useAuth";
import * as api from "../../utils/api";
import { ApiError } from "../../utils/api";
import type { AdminUser } from "../../../shared/types";

export default function UserManagement() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tempPw, setTempPw] = useState<{ id: number; pw: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api.getUsers());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<void>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    }
  }

  async function resetPw(u: AdminUser) {
    if (!window.confirm(`Reset ${u.username}'s password to the shared temp password?`)) return;
    setError(null);
    try {
      const { temp_password } = await api.resetUserPassword(u.id);
      setTempPw({ id: u.id, pw: temp_password });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    }
  }

  if (loading) {
    return <p className="text-[12.5px] font-semibold text-(color:--color-text-muted)">Loading users…</p>;
  }

  return (
    <div className="space-y-2.5">
      {error && (
        <div className="rounded-[11px] border border-[rgba(255,90,77,0.32)] bg-[rgba(255,90,77,0.08)] px-4 py-2.5 text-[12.5px] font-semibold text-[#F4C7C1]">{error}</div>
      )}
      {users.map((u) => (
        <div key={u.id} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex-1 text-sm font-bold text-(color:--color-text-primary)">
              {u.username}
              {u.is_admin && (
                <span className="ml-2 rounded-[6px] border border-[rgba(255,61,127,0.4)] bg-[rgba(255,61,127,0.12)] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-(color:--color-accent-light)">Admin</span>
              )}
              {me?.id === u.id && (
                <span className="ml-2 text-[10px] font-bold text-(color:--color-text-muted)">(you)</span>
              )}
            </span>
            {u.is_admin ? (
              <button type="button" onClick={() => act(() => api.demoteUser(u.id), `Remove admin from ${u.username}?`)}
                className="rounded-[8px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-(color:--color-text-secondary) hover:text-(color:--color-text-primary)">Demote</button>
            ) : (
              <button type="button" onClick={() => act(() => api.promoteUser(u.id))}
                className="rounded-[8px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-(color:--color-text-secondary) hover:text-(color:--color-text-primary)">Make admin</button>
            )}
            <button type="button" onClick={() => resetPw(u)}
              className="rounded-[8px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-(color:--color-text-secondary) hover:text-(color:--color-text-primary)">Reset pw</button>
          </div>
          {tempPw?.id === u.id && (
            <div className="mt-2 rounded-[8px] border border-[rgba(52,211,153,0.3)] bg-[rgba(52,211,153,0.07)] px-3 py-2 text-[12px] font-bold text-[#6EE7B7]">
              Temp password: <span className="font-mono">{tempPw.pw}</span> — share it; they must change it on next login.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
