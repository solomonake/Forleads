import { describe, expect, it } from "vitest";
import config from "../../vitest.config";
// @ts-expect-error -- plain ESM script without type declarations
import { globToRegExp, summarize } from "../../scripts/coverage-summary.mjs";
import { SECURITY_CORE } from "../../coverage-scope.mjs";

describe("coverage scope is whole-app (G16)", () => {
  const coverage = (config as { test?: { coverage?: Record<string, unknown> } }).test?.coverage as {
    include: string[];
    thresholds: Record<string, unknown>;
  };

  it("measures every source file, not a hand-picked list", () => {
    expect(coverage.include).toEqual(["src/**/*.{ts,tsx}"]);
  });

  it("keeps the security core gate at 85/85/75/85 and adds a whole-app floor", () => {
    const coreKey = Object.keys(coverage.thresholds).find((k) => k.startsWith("{"));
    expect(coreKey).toBeDefined();
    expect(coverage.thresholds[coreKey!]).toEqual({ lines: 85, functions: 85, branches: 75, statements: 85 });
    for (const metric of ["lines", "functions", "branches", "statements"]) {
      expect(coverage.thresholds[metric]).toBeGreaterThan(0);
    }
  });
});

describe("coverage-summary", () => {
  it("matches the core globs", () => {
    expect(globToRegExp("src/lib/evidence/**/*.ts").test("/repo/src/lib/evidence/grade.ts")).toBe(true);
    expect(globToRegExp("src/lib/evidence/**/*.ts").test("/repo/src/lib/evidence/sub/x.ts")).toBe(true);
    expect(globToRegExp("src/lib/auth/agent.ts").test("/repo/src/lib/auth/agent.tsx")).toBe(false);
  });

  it("prints whole-app and security-core numbers separately", () => {
    const f = (covered: number, total: number) => ({
      statements: { covered, total },
      branches: { covered, total },
      functions: { covered, total },
      lines: { covered, total },
    });
    const s = summarize(
      {
        total: f(0, 0),
        "/r/src/lib/auth/agent.ts": f(9, 10),
        "/r/src/components/MapWorkspace.tsx": f(0, 90),
      },
      SECURITY_CORE,
    );
    expect(s.wholeApp.files).toBe(2);
    expect(s.wholeApp.lines.pct).toBe(9);
    expect(s.securityCore.files).toBe(1);
    expect(s.securityCore.lines.pct).toBe(90);
  });
});
