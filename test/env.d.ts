/// <reference types="@cloudflare/vitest-pool-workers/types" />

// The `env` exported from `cloudflare:test` is typed as `Cloudflare.Env`.
// Augment it with the bindings configured in `vitest.config.ts` so that the
// integration tests (and `SELF`-bound Worker) see the correct types.
declare namespace Cloudflare {
  interface Env {
    DRAFT_DB: D1Database;
    DRAFT_ROOM: DurableObjectNamespace;
    SESSION_SECRET: string;
    // Test-only binding holding parsed SQL migrations (see apply-migrations.ts).
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
