// Coverage scope and thresholds (G16), shared by vitest.config.ts and
// scripts/coverage-summary.mjs.

/** The security/evidence core: the only coverage scope before G16. */
export const SECURITY_CORE = [
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
];

/** Unchanged from before G16, judged over the core in aggregate. */
export const CORE_THRESHOLDS = { lines: 85, functions: 85, branches: 75, statements: 85 };

/**
 * Whole-app floor: the level measured on 2026-11-07 (statements 56.99,
 * branches 45.2, functions 52.89, lines 59.48), rounded down, so CI passes
 * today and fails on a slide. Raise it as coverage grows.
 */
export const WHOLE_APP_FLOOR = { lines: 59, functions: 52, branches: 45, statements: 56 };
