import { defineConfig } from "vitest/config";
import path from "node:path";
import { CORE_THRESHOLDS, SECURITY_CORE, WHOLE_APP_FLOOR } from "./coverage-scope.mjs";

export default defineConfig({
  // tsconfig keeps JSX for Next ("preserve"). Compile it here so coverage can
  // parse untested .tsx files instead of dropping them from the report.
  oxc: { jsx: { runtime: "automatic" } },
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
      // scripts/coverage-summary.mjs prints whole-app and security-core lines
      // from json-summary after the run.
      reporter: ["text-summary", "json-summary"],
      // Whole app (G16): every source file counts, tested or not, so the
      // headline number is the real one. (Vitest 4 dropped `all: true`; an
      // `include` glob is how untested files get reported now.)
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
      thresholds: {
        // Whole-app floor, set just under the level measured on 2026-11-07
        // so CI passes today and catches a slide. Raise it as coverage grows.
        lines: WHOLE_APP_FLOOR.lines,
        functions: WHOLE_APP_FLOOR.functions,
        branches: WHOLE_APP_FLOOR.branches,
        statements: WHOLE_APP_FLOOR.statements,
        // Security/evidence core: the original gated set, unchanged at 85/75.
        // One glob so the core is judged in aggregate, as it was before.
        [`{${SECURITY_CORE.join(",")}}`]: CORE_THRESHOLDS,
      },
    },
  },
});
