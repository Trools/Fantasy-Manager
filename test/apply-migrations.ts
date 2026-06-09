import { applyD1Migrations, env } from "cloudflare:test";

// Setup files run outside the per-test-file storage isolation, and may run
// multiple times. `applyD1Migrations()` only applies migrations that haven't
// already been applied, so it is safe to call here. Combined with the pool's
// per-test-file storage isolation, every integration test file starts from a
// freshly migrated, empty database.
await applyD1Migrations(env.DRAFT_DB, env.TEST_MIGRATIONS);
