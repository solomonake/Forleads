import fs from "node:fs";
import path from "node:path";
import { parseArg, readJson, root, run } from "./agent-lib.mjs";

const manifestPath = ".agent/phase-manifest.json";
const outputPath = ".agent/metrics/phase-runs.jsonl";

function manifest() {
  return readJson(manifestPath);
}

function phaseById(data, id) {
  return data.phases.find((phase) => phase.id === id);
}

function nextPhase(data) {
  return data.phases.find((phase) => phase.status === "in_progress") ?? data.phases.find((phase) => phase.status === "planned");
}

function branch() {
  return run("git", ["branch", "--show-current"], { capture: true }).stdout.trim() || "detached";
}

function commit() {
  return run("git", ["rev-parse", "--short=12", "HEAD"], { capture: true }).stdout.trim() || "unknown";
}

function statusLine(status) {
  if (status === "done") return "done";
  if (status === "blocked") return "blocked";
  if (status === "in_progress") return "active";
  return "planned";
}

function list() {
  const data = manifest();
  console.log(`# ${data.goal}`);
  for (const phase of data.phases) {
    console.log(`${phase.id}\t${statusLine(phase.status)}\t${phase.title}`);
  }
}

function prompt() {
  const data = manifest();
  const requested = parseArg("phase", "");
  const phase = requested ? phaseById(data, requested) : nextPhase(data);
  if (!phase) {
    throw new Error(requested ? `Unknown phase: ${requested}` : "No planned or active phase found");
  }

  console.log(`# Forleads Phase: ${phase.title}`);
  console.log("");
  console.log(`Phase id: ${phase.id}`);
  console.log(`Risk: ${phase.risk}`);
  console.log(`Packet: ${phase.packet}`);
  console.log("");
  console.log("## Objective");
  console.log(phase.objective);
  console.log("");
  console.log("## Files");
  for (const file of phase.files) console.log(`- ${file}`);
  console.log("");
  console.log("## Acceptance");
  for (const item of phase.acceptance) console.log(`- ${item}`);
  console.log("");
  console.log("## Stop Rules");
  for (const item of data.stopRules) console.log(`- ${item}`);
  console.log("");
  console.log("## Proof Floor");
  for (const item of data.proofFloor) console.log(`- ${item}`);
}

function numberArg(name, fallback = "0") {
  const value = Number.parseFloat(parseArg(name, fallback));
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a non-negative number`);
  return value;
}

function integerArg(name, fallback = "0") {
  const value = Number.parseInt(parseArg(name, fallback), 10);
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} must be a non-negative integer`);
  return value;
}

function record() {
  const data = manifest();
  const id = parseArg("phase", "");
  const phase = phaseById(data, id);
  if (!phase) throw new Error("--phase must match an id in .agent/phase-manifest.json");

  const outcome = parseArg("outcome", "partial");
  if (!["success", "partial", "failed", "blocked"].includes(outcome)) {
    throw new Error("--outcome must be success, partial, failed, or blocked");
  }

  const gatesPassed = integerArg("gates-passed");
  const gatesTotal = integerArg("gates-total");
  if (gatesPassed > gatesTotal) throw new Error("--gates-passed cannot exceed --gates-total");

  const row = {
    schemaVersion: "1.0.0",
    recordedAt: new Date().toISOString(),
    phaseId: phase.id,
    title: phase.title,
    risk: phase.risk,
    outcome,
    branch: branch(),
    commit: commit(),
    productLift: numberArg("product-lift"),
    evidenceQuality: numberArg("evidence-quality"),
    safety: numberArg("safety"),
    gateScore: gatesTotal === 0 ? 0 : Number((gatesPassed / gatesTotal).toFixed(2)),
    gatesPassed,
    gatesTotal,
    proof: parseArg("proof", ""),
    blockers: parseArg("blockers", ""),
    next: parseArg("next", ""),
    notes: parseArg("notes", ""),
  };

  fs.mkdirSync(path.join(root, ".agent", "metrics"), { recursive: true });
  fs.appendFileSync(path.join(root, outputPath), `${JSON.stringify(row)}\n`);
  console.log(`[agent:phase:record] appended ${outputPath}`);
  console.log(JSON.stringify(row, null, 2));
}

const command = process.argv[2] ?? "prompt";
if (command === "list") list();
else if (command === "prompt") prompt();
else if (command === "record") record();
else {
  throw new Error(`Unknown command: ${command}. Use list, prompt, or record.`);
}
