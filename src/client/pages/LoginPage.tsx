import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/Button";
import { ApiError } from "../utils/api";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(username, password);
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
            Sign in to join the draft
          </p>
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
              placeholder="Enter your username"
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
              placeholder="Enter your password"
              required
            />
          </div>

          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Log in
          </Button>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-[--color-text-secondary]">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="text-[--color-accent-primary] hover:underline font-medium"
          >
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
