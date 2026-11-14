#!/usr/bin/env node
// Prints two coverage numbers after `vitest run --coverage` (G16): the whole
// app, and the security/evidence core that used to be the only scope. Reads
// coverage/coverage-summary.json (the json-summary reporter). Informational:
// the thresholds themselves live in vitest.config.ts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const METRICS = ["statements", "branches", "functions", "lines"];

/** Minimal glob → RegExp for the patterns used in vitest.config.ts. */
export function globToRegExp(glob) {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`(^|/)${re}$`);
}

/**
 * @param {Record<string, Record<string, { total: number, covered: number }>>} summary
 * @param {string[]} coreGlobs
 */
export function summarize(summary, coreGlobs) {
  const files = Object.entries(summary).filter(([file]) => file !== "total");
  const patterns = coreGlobs.map(globToRegExp);
  const pick = (entries) =>
    Object.fromEntries(
      METRICS.map((m) => {
        const total = entries.reduce((n, [, f]) => n + (f[m]?.total ?? 0), 0);
        const covered = entries.reduce((n, [, f]) => n + (f[m]?.covered ?? 0), 0);
        return [m, { total, covered, pct: total ? Math.round((covered / total) * 10_000) / 100 : 100 }];
      }),
    );
  const core = files.filter(([file]) => patterns.some((p) => p.test(file.split(path.sep).join("/"))));
  return { wholeApp: { files: files.length, ...pick(files) }, securityCore: { files: core.length, ...pick(core) } };
}

function line(label, s) {
  return `${label.padEnd(26)} ${String(s.files).padStart(4)} files  ` +
    METRICS.map((m) => `${m} ${s[m].pct.toFixed(2)}%`).join("  ");
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const summary = JSON.parse(readFileSync(path.join(ROOT, "coverage/coverage-summary.json"), "utf8"));
  const { SECURITY_CORE } = await import("../coverage-scope.mjs");
  const s = summarize(summary, SECURITY_CORE);
  console.log(line("Coverage, whole app:", s.wholeApp));
  console.log(line("Coverage, security core:", s.securityCore));
}
