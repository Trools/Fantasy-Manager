import { Link } from "react-router-dom";
import { useDraft } from "../hooks/useDraft";
import DraftSettings from "../components/admin/DraftSettings";
import DraftControls from "../components/admin/DraftControls";
import UserManagement from "../components/admin/UserManagement";

const card = "rounded-2xl overflow-hidden";
const cardStyle = { background: "#11161F", border: "1px solid rgba(255,255,255,0.07)" } as const;
const headerStyle = { borderBottom: "1px solid rgba(255,255,255,0.07)" } as const;
const headerClass = "font-extrabold text-[11px] leading-none tracking-[0.12em] uppercase text-(color:--color-text-muted)";

const STATUS_LABEL: Record<string, string> = {
  lobby: "In lobby",
  in_progress: "Draft in progress",
  paused: "Draft paused",
  complete: "Draft complete",
};

export default function AdminPage() {
  const { state } = useDraft();
  const status = state?.status ?? "lobby";

  return (
    <div
      className="min-h-screen text-(color:--color-text-primary)"
      style={{
        background: "radial-gradient(1100px 380px at 80% -140px, rgba(255,61,127,0.09), transparent 70%), #0A0E16",
        fontFamily: "Archivo, sans-serif",
      }}
    >
      <div className="max-w-[1140px] mx-auto px-7 pt-6 pb-20">
        {/* App bar */}
        <div className="flex items-center gap-3.5 mb-6">
          <Link to="/" className="inline-flex items-center justify-center w-[42px] h-[42px] rounded-xl font-black text-[14px] leading-none text-white"
            style={{ background: "linear-gradient(140deg,#FF3D7F,#A01F4F)", boxShadow: "0 6px 18px rgba(255,61,127,0.35)" }} aria-label="Back to Draft">WC26</Link>
          <div className="flex-1">
            <div className="font-black text-[22px] leading-none tracking-[-0.01em] text-white">Admin console</div>
            <div className="font-semibold text-xs leading-none text-(color:--color-text-secondary) mt-1">Full control over the draft, users &amp; players</div>
          </div>
          <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full" style={{ background: "rgba(255,61,127,0.10)", border: "1px solid rgba(255,61,127,0.3)" }}>
            <span className="w-2 h-2 rounded-full bg-(--color-accent-primary)" />
            <span className="font-extrabold text-[11px] leading-none tracking-[0.1em] text-(color:--color-accent-light) uppercase">{STATUS_LABEL[status]}</span>
          </span>
        </div>

        <div className="grid gap-[14px] items-start md:grid-cols-2 lg:grid-cols-3">
          {/* Draft Controls */}
          <section className={card} style={cardStyle}>
            <div className="px-5 py-3.5" style={headerStyle}><h2 className={headerClass}>Draft Controls</h2></div>
            <div className="p-5"><DraftControls /></div>
          </section>

          {/* Settings */}
          <section className={card} style={cardStyle}>
            <div className="px-5 py-3.5" style={headerStyle}><h2 className={headerClass}>Draft Settings</h2></div>
            <div className="p-5"><DraftSettings editable={status === "lobby"} /></div>
          </section>

          {/* User Management */}
          <section className={card} style={cardStyle}>
            <div className="px-5 py-3.5" style={headerStyle}><h2 className={headerClass}>User Management</h2></div>
            <div className="p-5"><UserManagement /></div>
          </section>
        </div>
      </div>
    </div>
  );
}
