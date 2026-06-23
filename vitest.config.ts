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
    poolOptions: { forks: { singleFork: true } },
  },
});
