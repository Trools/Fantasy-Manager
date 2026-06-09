import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  // Read all SQL migrations from ./migrations so they can be applied to the
  // test D1 database via a setup file (see test/apply-migrations.ts).
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));

  return {
    test: {
      projects: [
        // Pure unit tests run in a plain Node environment.
        {
          test: {
            name: "node",
            environment: "node",
            include: ["test/draft-logic.test.ts", "test/crypto.test.ts"],
          },
        },
        // Integration tests run inside the Workers runtime via Miniflare.
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                // Test-only binding holding parsed migrations, applied in setup.
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  SESSION_SECRET: "test-secret",
                },
              },
            }),
          ],
          test: {
            name: "workers",
            include: ["test/**/*.integration.test.ts"],
            setupFiles: ["./test/apply-migrations.ts"],
          },
        },
      ],
    },
  };
});
