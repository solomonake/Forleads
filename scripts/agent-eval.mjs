import fs from "node:fs";
import path from "node:path";
import { printSummary, readJson, root } from "./agent-lib.mjs";

const corpus = readJson(".agent/evals/corpus.v1.json");
const checks = [];
for (const scenario of corpus.scenarios) {
  const missing = ["id", "category", "risk", "input", "expected"].filter((key) => !scenario[key]);
  checks.push({
    ok: missing.length === 0,
    label: `corpus:${scenario.id ?? "unknown"}`,
    detail: missing.length ? `missing ${missing.join(", ")}` : scenario.category,
  });
}

const sourceChecks = [
  ["revision-safe-approval", "src/lib/pipeline.ts", /expectedRevision[\s\S]+artifact\.revision/],
  ["compliance-recheck-on-edit", "src/lib/artifacts/revise.ts", /lintArtifactText/],
  ["honest-risk-gap", "src/lib/agents/scouts.ts", /No verified hazard provider/],
  ["tenant-derived-server-side", "src/lib/auth/agent.ts", /agentIdForSub/],
  ["connector-idempotency", "src/lib/pipeline.ts", /idempotencyKey/],
];
for (const [label, file, pattern] of sourceChecks) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  checks.push({ ok: pattern.test(content), label: `invariant:${label}`, detail: file });
}

printSummary(`Agent Evaluation Corpus ${corpus.version}`, checks);
const passed = checks.filter((check) => check.ok).length;
const score = Math.round((passed / checks.length) * 100);
console.log(`\nscore=${score} passed=${passed} total=${checks.length}`);
process.exit(score === 100 ? 0 : 1);
