import fs from "node:fs";
import path from "node:path";
import { exists, printSummary, readJson, root } from "./agent-lib.mjs";

const checks = [];
const required = [
  "AGENTS.md",
  "CLAUDE.md",
  ".agent/AGENT_OS.md",
  ".agent/playbook.md",
  ".agent/decisions.md",
  ".agent/knowledge/catalog.json",
  ".agent/evals/corpus.v1.json",
  ".agent/handoffs/current.md",
  ".agent/metrics/schema.v1.json",
];
for (const file of required) {
  checks.push({ ok: exists(file), label: `required:${file}` });
}

const major = Number(process.versions.node.split(".")[0]);
checks.push({
  ok: major >= 20 && major < 23,
  warn: major < 20 || major >= 23,
  label: "node-engine",
  detail: `${process.version}; repo requires >=20 <23`,
});

const pkg = readJson("package.json");
for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
  const scriptRefs = [...String(command).matchAll(/(?:node|bash)\s+([^\s]+)/g)].map((match) => match[1]);
  for (const ref of scriptRefs) {
    checks.push({ ok: exists(ref), label: `script:${name}`, detail: ref });
  }
}

const migrationsDir = path.join(root, "supabase/migrations");
const migrations = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
const migrationNumbers = migrations.map((file) => Number(file.split("_")[0]));
const sequential = migrationNumbers.every((number, index) => index === 0 || number > migrationNumbers[index - 1]);
checks.push({
  ok: sequential,
  label: "migrations-ordered",
  detail: migrations.join(", "),
});

const apiFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    if (entry.isFile() && entry.name === "route.ts") apiFiles.push(full);
  }
}
walk(path.join(root, "src/app/api"));
for (const file of apiFiles) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  const mutates = /export (?:const|async function) (POST|PATCH|PUT|DELETE)/.test(source);
  if (mutates && !relative.includes("/auth/google/")) {
    checks.push({
      ok: /ensureCurrentAgent|requireAgentId|getSession|zapierSecret|webhookSecret/.test(source),
      label: `auth-boundary:${relative}`,
    });
  }
  checks.push({
    ok: /withRoute/.test(source) || relative.includes("/auth/google/"),
    label: `observability:${relative}`,
  });
}

const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const staleCount = readme.match(/vitest \((\d+) tests\)/);
checks.push({
  ok: !staleCount,
  warn: Boolean(staleCount),
  label: "readme-generated-counts",
  detail: staleCount ? "README contains a hand-maintained test count" : "",
});

printSummary("Forleads Agent Doctor", checks);
const failed = checks.filter((check) => !check.ok && !check.warn);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed; ${failed.length} blocking.`);
process.exit(failed.length ? 1 : 0);
