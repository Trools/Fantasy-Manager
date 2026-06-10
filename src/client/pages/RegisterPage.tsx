import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ApiError } from "../utils/api";

const POS_CHIPS = [
  { code: "GK", fg: "#FBBF24", bg: "rgba(251,191,36,0.16)", bd: "rgba(251,191,36,0.45)" },
  { code: "DEF", fg: "#6AA8FF", bg: "rgba(59,130,246,0.16)", bd: "rgba(59,130,246,0.45)" },
  { code: "MID", fg: "#34D399", bg: "rgba(16,185,129,0.16)", bd: "rgba(16,185,129,0.45)" },
  { code: "FWD", fg: "#FB8359", bg: "rgba(244,96,46,0.18)", bd: "rgba(244,96,46,0.5)" },
];

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
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

  const inputClass =
    "w-full rounded-[11px] px-3.5 py-3.5 text-[15px] font-semibold leading-none text-(color:--color-text-primary) bg-white/5 outline-none placeholder:text-(color:--color-text-muted)";
  const inputBorder = `1px solid ${error ? "rgba(255,90,77,0.4)" : "rgba(255,255,255,0.10)"}`;

  return (
    <div className="min-h-screen flex bg-[#0A0E16] text-(color:--color-text-primary) font-sans">
      {/* LEFT BRAND PANEL */}
      <div
        className="relative hidden lg:flex flex-1 min-w-0 flex-col justify-between overflow-hidden p-[56px_52px]"
        style={{
          background:
            "radial-gradient(700px 460px at 30% 20%, rgba(255,61,127,0.22), transparent 70%), linear-gradient(160deg,#16101A,#0B0A12)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 72px)",
          }}
        />
        <div className="relative flex items-center gap-[13px]">
          <span
            className="inline-flex h-[46px] w-[46px] items-center justify-center rounded-[13px] text-center text-[15px] font-black leading-none text-white"
            style={{
              background: "linear-gradient(140deg,#FF3D7F,#A01F4F)",
              boxShadow: "0 8px 22px rgba(255,61,127,0.4)",
            }}
          >
            WC
            <br />
            26
          </span>
          <span className="text-[17px] font-extrabold leading-none text-(color:--color-text-primary)">
            World Cup 2026 Draft
          </span>
        </div>

        <div className="relative">
          <div className="mb-[22px] inline-flex items-center gap-[9px]">
            <span
              className="h-[9px] w-[9px] animate-pulse rounded-full bg-(--color-accent-primary)"
              style={{ boxShadow: "0 0 14px #FF3D7F" }}
            />
            <span className="text-[11px] font-extrabold uppercase leading-none tracking-[0.16em] text-(color:--color-accent-light)">
              Live snake draft
            </span>
          </div>
          <h1 className="m-0 max-w-[480px] text-[52px] font-black leading-[1.0] tracking-[-0.025em] text-white">
            Draft night
            <br />
            starts here.
          </h1>
          <p className="mt-5 max-w-[430px] text-[16px] font-medium leading-[1.6] text-(color:--color-text-secondary)">
            Gather your league, set the rules, and go pick-for-pick for the world's best.
            Real players, real-time, winner takes bragging rights.
          </p>
          <div className="mt-[30px] flex gap-[9px]">
            {POS_CHIPS.map((c) => (
              <span
                key={c.code}
                className="rounded-[9px] px-[13px] py-2 text-[12px] font-extrabold leading-none tracking-[0.05em]"
                style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}
              >
                {c.code}
              </span>
            ))}
          </div>
        </div>

        <div className="relative text-[12px] font-semibold leading-[1.5] text-[#6B5560]">
          Home league · 4–8 managers · no scoring, just the draft.
        </div>
      </div>

      {/* RIGHT FORM PANEL */}
      <div className="flex w-full flex-none flex-col justify-center border-l border-white/[0.06] bg-[#0A0E16] p-[48px_24px] sm:p-[48px_56px] lg:w-[540px]">
        {/* tabs */}
        <div className="mb-[26px] inline-flex self-start gap-1 rounded-[12px] border border-white/[0.08] bg-white/5 p-1">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="cursor-pointer rounded-[9px] bg-transparent px-5 py-[11px] text-[13px] font-extrabold leading-none text-(color:--color-text-secondary)"
          >
            Log in
          </button>
          <button
            type="button"
            className="rounded-[9px] bg-(--color-accent-primary) px-5 py-[11px] text-[13px] font-extrabold leading-none text-[#0A0E16]"
          >
            Create account
          </button>
        </div>

        <h2 className="m-0 mb-2 text-[30px] font-black leading-[1.05] tracking-[-0.02em] text-white">
          Create your account
        </h2>
        <p className="m-0 mb-[22px] text-[14px] font-medium leading-[1.5] text-[#8A97A8]">
          Pick a username and password — no email needed.
        </p>

        {/* first-user hint */}
        {isFirstUser && !error && (
          <div className="mb-[18px] flex items-center gap-2.5 rounded-[11px] border border-[#22D3EE]/30 bg-[#22D3EE]/[0.07] px-3.5 py-3">
            <span className="text-[15px]">⭐</span>
            <span className="text-[13px] font-semibold leading-[1.4] text-[#7DE3F2]">
              You're the first here — you'll be the draft admin.
            </span>
          </div>
        )}

        {error && (
          <div className="mb-[18px] flex items-center gap-2.5 rounded-[11px] border border-[#FF5A4D]/30 bg-[#FF5A4D]/10 px-3.5 py-3">
            <span className="text-[14px] text-(color:--color-accent-urgent)">⚠</span>
            <span className="text-[13px] font-semibold leading-[1.4] text-[#F4C7C1]">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3.5">
            <div className="mb-2 text-[11px] font-bold leading-none tracking-[0.04em] text-[#8A97A8]">
              Username
            </div>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              style={{ border: inputBorder }}
              placeholder="your_username"
              autoFocus
              required
            />
          </div>

          <div className="mb-3.5">
            <div className="mb-2 text-[11px] font-bold leading-none tracking-[0.04em] text-[#8A97A8]">
              Password
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                style={{ border: inputBorder }}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer bg-transparent p-1.5 text-[11px] font-bold leading-none text-[#6B788A]"
              >
                {showPass ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>

          <div className="mb-5">
            <div className="mb-2 text-[11px] font-bold leading-none tracking-[0.04em] text-[#8A97A8]">
              Confirm password
            </div>
            <input
              id="confirmPassword"
              type={showPass ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              style={{ border: inputBorder }}
              placeholder="Re-enter password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2.5 rounded-[12px] py-[15px] text-[14px] font-black uppercase leading-none tracking-[0.04em] text-white"
            style={{
              background: loading ? "#B02659" : "#FF3D7F",
              borderBottom: "3px solid #A01F4F",
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading && (
              <span
                className="inline-block h-[15px] w-[15px] animate-spin rounded-full"
                style={{ border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff" }}
              />
            )}
            <span>{loading ? "Creating account…" : "Create account"}</span>
          </button>
        </form>

        <div className="mt-[18px] text-center text-[13px] font-medium leading-none text-[#8A97A8]">
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="cursor-pointer bg-transparent p-0 text-[13px] font-extrabold leading-none text-(color:--color-accent-light)"
          >
            Log in
          </button>
        </div>
      </div>
    </div>
  );
}
