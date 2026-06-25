import fs from "node:fs";
import path from "node:path";
import { parseArg, root, run } from "./agent-lib.mjs";

function integer(name, fallback = "0") {
  const value = Number.parseInt(parseArg(name, fallback), 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return value;
}

function number(name, fallback = "0") {
  const value = Number.parseFloat(parseArg(name, fallback));
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative number`);
  }
  return value;
}

const outcome = parseArg("outcome", "success");
if (!["success", "partial", "failed", "blocked"].includes(outcome)) {
  throw new Error("--outcome must be success, partial, failed, or blocked");
}
const risk = parseArg("risk", "medium");
if (!["low", "medium", "high", "critical"].includes(risk)) {
  throw new Error("--risk must be low, medium, high, or critical");
}
const mandatoryGatesPassed = integer("gates-passed");
const mandatoryGatesTotal = integer("gates-total");
if (mandatoryGatesPassed > mandatoryGatesTotal) {
  throw new Error("--gates-passed cannot exceed --gates-total");
}

const row = {
  schemaVersion: "1.0.0",
  recordedAt: new Date().toISOString(),
  agent: parseArg("agent", "unknown"),
  model: parseArg("model", "unknown"),
  taskId: parseArg("task", "untracked"),
  risk,
  outcome,
  branch:
    run("git", ["branch", "--show-current"], { capture: true }).stdout.trim() ||
    "detached",
  commit:
    run("git", ["rev-parse", "--short=12", "HEAD"], { capture: true }).stdout.trim() ||
    "unknown",
  elapsedMinutes: number("elapsed-minutes"),
  humanInterventions: integer("human-interventions"),
  secretOrSpendApprovals: integer("secret-approvals"),
  commandCount: integer("command-count"),
  mandatoryGatesPassed,
  mandatoryGatesTotal,
  escapedDefects: integer("escaped-defects"),
  securityFindings: integer("security-findings"),
  productionIncidents: integer("production-incidents"),
  handoffRecoveryMinutes: number("handoff-recovery-minutes"),
  estimatedCostUsd: number("estimated-cost-usd"),
  notes: parseArg("notes", ""),
};

const output = path.join(root, ".agent", "metrics", "runs.jsonl");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.appendFileSync(output, `${JSON.stringify(row)}\n`);
console.log(`[agent:scorecard] appended ${path.relative(root, output)}`);
console.log(JSON.stringify(row, null, 2));
