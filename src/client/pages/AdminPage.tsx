import { Link } from "react-router-dom";
import Button from "../components/Button";

export default function AdminPage() {
  return (
    <div
      className="min-h-screen text-(color:--color-text-primary)"
      style={{
        background:
          "radial-gradient(1100px 380px at 80% -140px, rgba(255,61,127,0.09), transparent 70%), #0A0E16",
        fontFamily: "Archivo, sans-serif",
      }}
    >
      <div className="max-w-[1140px] mx-auto px-7 pt-6 pb-20">
        {/* App bar */}
        <div className="flex items-center gap-3.5 mb-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center w-[42px] h-[42px] rounded-xl font-black text-[14px] leading-none text-white"
            style={{
              background: "linear-gradient(140deg,#FF3D7F,#A01F4F)",
              boxShadow: "0 6px 18px rgba(255,61,127,0.35)",
            }}
            aria-label="Back to Draft"
          >
            WC26
          </Link>
          <div className="flex-1">
            <div className="font-black text-[22px] leading-none tracking-[-0.01em] text-white">
              Admin console
            </div>
            <div className="font-semibold text-xs leading-none text-(color:--color-text-secondary) mt-1">
              Full control over the draft, users &amp; players
            </div>
          </div>
          <span
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full"
            style={{
              background: "rgba(255,61,127,0.10)",
              border: "1px solid rgba(255,61,127,0.3)",
            }}
          >
            <span className="w-2 h-2 rounded-full bg-(--color-accent-primary)" />
            <span className="font-extrabold text-[11px] leading-none tracking-[0.1em] text-(color:--color-accent-light) uppercase">
              Draft in progress
            </span>
          </span>
        </div>

        <div className="grid gap-[14px] md:grid-cols-2 lg:grid-cols-3">
          {/* Draft Controls */}
          <section
            className="rounded-2xl overflow-hidden"
            style={{
              background: "#11161F",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              className="px-5 py-3.5"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              <h2 className="font-extrabold text-[11px] leading-none tracking-[0.12em] uppercase text-(color:--color-text-muted)">
                Draft Controls
              </h2>
            </div>
            <div className="p-5 space-y-3">
              <Button className="w-full" variant="secondary">
                Randomize Order
              </Button>
              <Button className="w-full">Start Draft</Button>
              <div
                className="pt-3 space-y-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
              >
                <Button className="w-full" variant="secondary" disabled>
                  ⏸ Pause Draft
                </Button>
                <Button className="w-full" variant="secondary" disabled>
                  ↩ Undo Last Pick
                </Button>
                <Button className="w-full" variant="secondary" disabled>
                  ＋30 Seconds
                </Button>
              </div>
              <div
                className="pt-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
              >
                <Button
                  className="w-full font-extrabold uppercase tracking-wide text-white border-b-[3px]"
                  style={{
                    background: "#FF5A4D",
                    borderBottomColor: "#B0291F",
                  }}
                >
                  Reset Draft
                </Button>
              </div>
            </div>
          </section>

          {/* Settings */}
          <section
            className="rounded-2xl overflow-hidden"
            style={{
              background: "#11161F",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              className="px-5 py-3.5"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              <h2 className="font-extrabold text-[11px] leading-none tracking-[0.12em] uppercase text-(color:--color-text-muted)">
                Draft Settings
              </h2>
            </div>
            <div className="p-5">
              <p className="font-semibold text-[12.5px] leading-relaxed text-(color:--color-text-muted)">
                Settings editor coming soon. Use API directly for now.
              </p>
            </div>
          </section>

          {/* User Management */}
          <section
            className="rounded-2xl overflow-hidden"
            style={{
              background: "#11161F",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              className="px-5 py-3.5"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              <h2 className="font-extrabold text-[11px] leading-none tracking-[0.12em] uppercase text-(color:--color-text-muted)">
                User Management
              </h2>
            </div>
            <div className="p-5">
              <p className="font-semibold text-[12.5px] leading-relaxed text-(color:--color-text-muted)">
                User management coming soon. Use API directly for now.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
