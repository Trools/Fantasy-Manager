import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/Button";
import { ApiError } from "../utils/api";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isFirstUser, setIsFirstUser] = useState(false);

  // Check if this will be the first user (admin)
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json() as Promise<{ users_count?: number }>)
      .then((data) => {
        if (data.users_count === 0) {
          setIsFirstUser(true);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      await register(username, password);
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
    <div className="min-h-screen flex items-center justify-center bg-[--color-bg-primary] px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[--color-text-primary] mb-2">
            World Cup 2026 Draft
          </h1>
          <p className="text-[--color-text-secondary]">
            Create your account to join the draft
          </p>
        </div>

        {/* First user hint */}
        {isFirstUser && (
          <div className="mb-6 p-3 rounded-lg bg-[--color-accent-primary]/10 border border-[--color-accent-primary]/30 text-[--color-accent-primary] text-sm">
            You're the first here — you'll be the draft admin.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-[--color-text-secondary] mb-1.5"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-[--color-bg-surface] border border-[--color-border-default]
                text-[--color-text-primary] placeholder-[--color-text-muted]
                focus:outline-none focus:ring-2 focus:ring-[--color-accent-primary]/50 focus:border-[--color-accent-primary]"
              placeholder="Choose a username"
              autoFocus
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[--color-text-secondary] mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-[--color-bg-surface] border border-[--color-border-default]
                text-[--color-text-primary] placeholder-[--color-text-muted]
                focus:outline-none focus:ring-2 focus:ring-[--color-accent-primary]/50 focus:border-[--color-accent-primary]"
              placeholder="Choose a password"
              required
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-[--color-text-secondary] mb-1.5"
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-[--color-bg-surface] border border-[--color-border-default]
                text-[--color-text-primary] placeholder-[--color-text-muted]
                focus:outline-none focus:ring-2 focus:ring-[--color-accent-primary]/50 focus:border-[--color-accent-primary]"
              placeholder="Confirm your password"
              required
            />
          </div>

          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Create account
          </Button>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-[--color-text-secondary]">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-[--color-accent-primary] hover:underline font-medium"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
