import fs from "node:fs";
import path from "node:path";
import { parseArg, root, run } from "./agent-lib.mjs";

const manifestPath = path.join(root, ".agent", "phase-manifest.json");
const metricsPath = path.join(root, ".agent", "metrics", "phase-runs.jsonl");
const sharedReads = [
  "AGENTS.md",
  ".agent/AGENT_OS.md",
  ".agent/onboarding-notes.md",
  ".agent/playbook.md",
  ".agent/decisions.md",
  ".agent/decisions/phase-0-resolutions.md",
  ".agent/handoffs/current.md",
];

function loadManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function saveManifest(manifest) {
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function numberArg(name, fallback = "0") {
  const value = Number.parseFloat(parseArg(name, fallback));
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`--${name} must be a number from 0 to 100`);
  }
  return value;
}

function integerArg(name, fallback = "0") {
  const value = Number.parseInt(parseArg(name, fallback), 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return value;
}

function findPhase(manifest, id = "") {
  if (id) {
    const phase = manifest.phases.find((item) => item.id === id);
    if (!phase) throw new Error(`Unknown phase: ${id}`);
    return phase;
  }
  const phase = manifest.phases.find((item) => ["ready", "pending"].includes(item.status));
  if (!phase) throw new Error("No ready or pending phase remains.");
  return phase;
}

function score(weights) {
  const product = numberArg("product");
  const evidence = numberArg("evidence");
  const safety = numberArg("safety");
  const tokenEfficiency = numberArg("token-efficiency");
  const driftControl = numberArg("drift-control");
  const weighted =
    (product * weights.product +
      evidence * weights.evidence +
      safety * weights.safety +
      tokenEfficiency * weights.tokenEfficiency +
      driftControl * weights.driftControl) /
    100;
  return {
    product,
    evidence,
    safety,
    tokenEfficiency,
    driftControl,
    improvementScore: Math.round(weighted),
  };
}

function statusLine(phase) {
  return `${phase.status.toUpperCase()} ${phase.id} (${phase.risk}) - ${phase.title}`;
}

function printList(manifest) {
  console.log(`# Phase Manifest\n`);
  for (const phase of manifest.phases) {
    console.log(`- ${statusLine(phase)}`);
  }
}

function printPrompt(phase) {
  const reads = [...sharedReads, ...phase.packets];
  console.log(`# Focused Worker Prompt: ${phase.id}\n`);
  console.log("You are implementing exactly this Forleads phase. Do not re-plan the whole product.");
  console.log("Read only these files first:");
  for (const file of reads) console.log(`- ${file}`);
  console.log("\nRules:");
  console.log("- Search before reading large files.");
  console.log("- Inspect only source files named by this phase's packet unless a failing test requires more.");
  console.log("- Keep private SRL methods out of repo artifacts.");
  console.log("- Stop for secrets, spending, production mutation, destructive actions, or external communication.");
  console.log("- Record proof with npm run agent:phase:record before marking the phase complete.");
  console.log("\nAcceptance:");
  for (const item of phase.acceptance ?? []) console.log(`- ${item}`);
  console.log("\nSuggested branch(es):");
  for (const branch of phase.targetBranches ?? []) console.log(`- ${branch}`);
}

function record(manifest) {
  const phase = findPhase(manifest, parseArg("phase"));
  const outcome = parseArg("outcome", "partial");
  if (!["success", "partial", "failed", "blocked"].includes(outcome)) {
    throw new Error("--outcome must be success, partial, failed, or blocked");
  }
  const scores = score(manifest.scoreWeights);
  const gatePassed = integerArg("gates-passed");
  const gateTotal = integerArg("gates-total");
  if (gatePassed > gateTotal) throw new Error("--gates-passed cannot exceed --gates-total");

  const row = {
    schemaVersion: "1.0.0",
    recordedAt: new Date().toISOString(),
    phaseId: phase.id,
    risk: phase.risk,
    outcome,
    branch: run("git", ["branch", "--show-current"], { capture: true }).stdout.trim() || "detached",
    commit: run("git", ["rev-parse", "--short=12", "HEAD"], { capture: true }).stdout.trim() || "unknown",
    scores,
    gates: { passed: gatePassed, total: gateTotal },
    context: {
      filesRead: integerArg("files-read"),
      repeatedReads: integerArg("repeated-reads"),
      commandCount: integerArg("command-count"),
      elapsedMinutes: Number.parseFloat(parseArg("elapsed-minutes", "0")) || 0,
    },
    novelty: parseArg("novelty", ""),
    drift: parseArg("drift", ""),
    proof: parseArg("proof", ""),
    next: parseArg("next", ""),
  };

  fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
  fs.appendFileSync(metricsPath, `${JSON.stringify(row)}\n`);

  if (outcome === "success" && scores.improvementScore >= 70 && gatePassed === gateTotal) {
    phase.status = "completed";
    phase.completedAt = row.recordedAt;
  } else if (outcome === "blocked" || scores.driftControl < 70) {
    phase.status = "blocked";
    phase.blockedAt = row.recordedAt;
  } else {
    phase.status = "ready";
  }
  phase.lastScore = scores.improvementScore;
  phase.lastOutcome = outcome;
  saveManifest(manifest);

  console.log(`[agent:phase] recorded ${phase.id} score=${scores.improvementScore} outcome=${outcome}`);
  console.log(JSON.stringify(row, null, 2));
}

const manifest = loadManifest();
if (process.argv.includes("--list")) {
  printList(manifest);
} else if (process.argv.includes("--record")) {
  record(manifest);
} else {
  const phase = findPhase(manifest, parseArg("phase"));
  console.log(statusLine(phase));
  console.log("");
  printPrompt(phase);
}
