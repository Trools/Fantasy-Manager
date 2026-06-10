import { Link } from "react-router-dom";
import Button from "../components/Button";

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-[--color-bg-primary]">
      {/* Header */}
      <header className="border-b border-[--color-border-default] bg-[--color-bg-surface]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-[--color-text-secondary] hover:text-[--color-text-primary]"
            >
              ← Back to Draft
            </Link>
            <h1 className="text-xl font-bold text-[--color-text-primary]">
              Admin Console
            </h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Draft Controls */}
          <div className="bg-[--color-bg-surface] rounded-lg border border-[--color-border-default] overflow-hidden">
            <div className="px-4 py-3 border-b border-[--color-border-default]">
              <h2 className="font-semibold text-[--color-text-primary]">
                Draft Controls
              </h2>
            </div>
            <div className="p-4 space-y-3">
              <Button className="w-full" variant="secondary">
                Randomize Order
              </Button>
              <Button className="w-full">Start Draft</Button>
              <div className="pt-2 border-t border-[--color-border-muted] space-y-3">
                <Button className="w-full" variant="secondary" disabled>
                  Pause Draft
                </Button>
                <Button className="w-full" variant="secondary" disabled>
                  Undo Last Pick
                </Button>
                <Button className="w-full" variant="secondary" disabled>
                  +30 Seconds
                </Button>
              </div>
              <div className="pt-2 border-t border-[--color-border-muted]">
                <Button className="w-full" variant="destructive">
                  Reset Draft
                </Button>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="bg-[--color-bg-surface] rounded-lg border border-[--color-border-default] overflow-hidden">
            <div className="px-4 py-3 border-b border-[--color-border-default]">
              <h2 className="font-semibold text-[--color-text-primary]">
                Draft Settings
              </h2>
            </div>
            <div className="p-4">
              <p className="text-sm text-[--color-text-secondary]">
                Settings editor coming soon. Use API directly for now.
              </p>
            </div>
          </div>

          {/* User Management */}
          <div className="bg-[--color-bg-surface] rounded-lg border border-[--color-border-default] overflow-hidden">
            <div className="px-4 py-3 border-b border-[--color-border-default]">
              <h2 className="font-semibold text-[--color-text-primary]">
                User Management
              </h2>
            </div>
            <div className="p-4">
              <p className="text-sm text-[--color-text-secondary]">
                User management coming soon. Use API directly for now.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
