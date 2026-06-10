import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/Button";
import { ApiError } from "../utils/api";

export default function ChangePasswordPage() {
  const { changePassword } = useAuth();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      await changePassword(newPassword);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-(--color-bg-primary) px-4">
      <div className="w-full max-w-sm">
        {/* Banner */}
        <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
          <p className="text-sm font-medium">
            Your password was reset by an admin. Set a new password to continue.
          </p>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-(color:--color-text-primary) mb-2">
            Set New Password
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="newPassword"
              className="block text-sm font-medium text-(color:--color-text-secondary) mb-1.5"
            >
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-(--color-bg-surface) border border-(color:--color-border-default)
                text-(color:--color-text-primary) placeholder-(--color-text-muted)
                focus:outline-none focus:ring-2 focus:ring-(color:--color-accent-primary)/50 focus:border-(color:--color-accent-primary)"
              placeholder="Enter new password"
              autoFocus
              required
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-(color:--color-text-secondary) mb-1.5"
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-(--color-bg-surface) border border-(color:--color-border-default)
                text-(color:--color-text-primary) placeholder-(--color-text-muted)
                focus:outline-none focus:ring-2 focus:ring-(color:--color-accent-primary)/50 focus:border-(color:--color-accent-primary)"
              placeholder="Confirm new password"
              required
            />
          </div>

          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Set Password
          </Button>
        </form>
      </div>
    </div>
  );
}
