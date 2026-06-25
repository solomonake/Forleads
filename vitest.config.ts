import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
    // Integration tests share an in-memory repository + idempotency ledger
    // (module singletons). Run in a single fork so state is deterministic and
    // ordering-independent rather than racing across parallel workers.
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/lib/auth/agent.ts",
        "src/lib/auth/session.ts",
        "src/lib/auth/credentials.ts",
        "src/lib/agents/compliance.ts",
        "src/lib/evidence/**/*.ts",
        "src/lib/connectors/idempotency.ts",
        "src/lib/connectors/mime.ts",
        "src/lib/validation/**/*.ts",
        "src/lib/loops/analytics.ts",
        "src/lib/artifacts/**/*.ts",
      ],
      exclude: ["src/**/*.test.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85,
      },
    },
  },
});
