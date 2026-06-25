#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";

const root = process.cwd();
const agentDir = join(root, ".agent");
const statePath = join(agentDir, "session-state.json");
const configPath = join(agentDir, "scorecard.config.json");
const checkpointPath = join(agentDir, "CHECKPOINT.json");
const scorecardPath = join(agentDir, "SCORECARD.json");
const handoffPath = join(agentDir, "SESSION_HANDOFF.md");
const resumeCommand = "npm run agent:scorecard";

let activeChild = null;
let activeRun = null;
let interrupted = false;

function now() {
  return new Date().toISOString();
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, value);
  renameSync(temporary, path);
}

function atomicJSON(path, value) {
  atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

function git(args, fallback = "") {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : fallback;
}

function repoSnapshot() {
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  let ahead = null;
  let behind = null;
  if (upstream) {
    const counts = git(["rev-list", "--left-right", "--count", `HEAD...${upstream}`]).split(/\s+/);
    if (counts.length === 2) {
      ahead = Number(counts[0]);
      behind = Number(counts[1]);
    }
  }

  const porcelain = git(["status", "--short"]);
  return {
    branch: git(["branch", "--show-current"], "detached"),
    head: git(["rev-parse", "HEAD"], "unknown"),
    shortHead: git(["rev-parse", "--short", "HEAD"], "unknown"),
    upstream: upstream || null,
    ahead,
    behind,
    dirty: Boolean(porcelain),
    changes: porcelain ? porcelain.split("\n") : []
  };
}

function gradeFor(score, bands) {
  return Object.entries(bands)
    .sort((a, b) => b[1] - a[1])
    .find(([, minimum]) => score >= minimum)?.[0] ?? "D";
}

function scoreSummary(run, config) {
  if (!run) return null;
  const earned = run.checks
    .filter((check) => check.status === "passed")
    .reduce((sum, check) => sum + check.points, 0);
  const possible = run.checks.reduce((sum, check) => sum + check.points, 0);
  const score = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  const requiredPassed = run.checks
    .filter((check) => check.required)
    .every((check) => check.status === "passed");
  return {
    earned,
    possible,
    score,
    grade: gradeFor(score, config.gradeBands),
    requiredPassed
  };
}

function loadScorecardIfPresent() {
  try {
    return readJSON(scorecardPath);
  } catch {
    return null;
  }
}

function buildCheckpoint(state, config, run = loadScorecardIfPresent()) {
  return {
    schemaVersion: 1,
    writtenAt: now(),
    objective: state.objective,
    phase: state.phase,
    status: state.status,
    resumeCommand,
    repository: repoSnapshot(),
    productionBaseline: state.productionBaseline,
    acceptanceCriteria: state.acceptanceCriteria,
    nextActions: state.nextActions,
    notes: state.notes,
    scorecard: run
      ? {
          runId: run.runId,
          status: run.status,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt ?? null,
          currentCheck: run.currentCheck ?? null,
          summary: scoreSummary(run, config),
          path: ".agent/SCORECARD.json"
        }
      : null
  };
}

function renderHandoff(checkpoint, run) {
  const repo = checkpoint.repository;
  const summary = checkpoint.scorecard?.summary;
  const acceptanceMark =
    checkpoint.status === "complete" && summary?.requiredPassed ? "x" : " ";
  const checks = run?.checks ?? [];
  const checkRows = checks.length
    ? checks
        .map(
          (check) =>
            `| ${check.label} | ${check.status} | ${check.points} | ${check.durationMs ?? "—"} |`
        )
        .join("\n")
    : "| Not run yet | pending | — | — |";
  const changes = repo.changes.length
    ? repo.changes.map((change) => `- \`${change}\``).join("\n")
    : "- Clean working tree.";

  return `# Session handoff — generated, do not hand-edit

_Generated ${checkpoint.writtenAt} from \`.agent/session-state.json\` and live repository state._

## Objective
${checkpoint.objective}

## Current state
- Phase: \`${checkpoint.phase}\`
- Declared status: \`${checkpoint.status}\`
- Branch: \`${repo.branch}\` at \`${repo.shortHead}\`
- Upstream: \`${repo.upstream ?? "none"}\` (ahead ${repo.ahead ?? "?"}, behind ${repo.behind ?? "?"})
- Working tree dirty: \`${repo.dirty}\`
- Scorecard: \`${checkpoint.scorecard?.status ?? "not-run"}\`${summary ? ` · ${summary.score}/100 (${summary.grade}) · requiredPassed=${summary.requiredPassed}` : ""}

## Resume exactly here
\`\`\`bash
${checkpoint.resumeCommand}
\`\`\`

The command records each gate before it starts and immediately after it exits. Read
\`.agent/CHECKPOINT.json\` first after a crash; never infer success from missing output.

## Production baseline
- Endpoint: ${checkpoint.productionBaseline.endpoint}
- Expected policy: \`mockConnectorWritesAllowed=false\`
- Expected violations: \`0\`
- Expected live modes: persistence, geocoder, property, imagery, agent

## Scorecard checks
| Check | Status | Points | Duration ms |
|---|---:|---:|---:|
${checkRows}

## Working tree captured at checkpoint
${changes}

## Acceptance criteria
${checkpoint.acceptanceCriteria.map((item) => `- [${acceptanceMark}] ${item}`).join("\n")}

## Next actions
${checkpoint.nextActions.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Notes
${checkpoint.notes.map((item) => `- ${item}`).join("\n")}
`;
}

function persist(state, config, run = activeRun) {
  const checkpoint = buildCheckpoint(state, config, run);
  atomicJSON(checkpointPath, checkpoint);
  atomicWrite(handoffPath, renderHandoff(checkpoint, run));
  if (run) atomicJSON(scorecardPath, run);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateContract() {
  const state = readJSON(statePath);
  const config = readJSON(configPath);
  assert(state.schemaVersion === 1, "session-state schemaVersion must be 1");
  assert(typeof state.objective === "string" && state.objective.length > 20, "objective is missing");
  assert(typeof state.phase === "string" && state.phase.length > 0, "phase is missing");
  assert(Array.isArray(state.acceptanceCriteria) && state.acceptanceCriteria.length >= 3, "acceptance criteria are incomplete");
  assert(Array.isArray(state.nextActions) && state.nextActions.length > 0, "next actions are missing");
  assert(state.productionBaseline?.endpoint, "production baseline endpoint is missing");
  assert(Array.isArray(config.checks) && config.checks.length >= 3, "scorecard checks are incomplete");

  const ids = new Set();
  for (const check of config.checks) {
    assert(!ids.has(check.id), `duplicate scorecard check id: ${check.id}`);
    ids.add(check.id);
    assert(Array.isArray(check.command) && check.command.length > 0, `check ${check.id} has no command`);
    assert(Number.isFinite(check.points) && check.points > 0, `check ${check.id} has invalid points`);
    assert(Number.isFinite(check.timeoutMs) && check.timeoutMs > 0, `check ${check.id} has invalid timeout`);
  }

  return { state, config };
}

async function verifyProduction() {
  const state = readJSON(statePath);
  const expected = state.productionBaseline.expected;
  let actual;
  try {
    const response = await fetch(state.productionBaseline.endpoint, {
      headers: { accept: "application/json", "user-agent": "Forleads-Agent-Scorecard/1.0" },
      signal: AbortSignal.timeout(30000)
    });
    assert(response.ok, `production health returned HTTP ${response.status}`);
    actual = await response.json();
  } catch (fetchError) {
    const curl = spawnSync(
      "curl",
      [
        "--fail",
        "--silent",
        "--show-error",
        "--max-time",
        "30",
        "-H",
        "accept: application/json",
        "-H",
        "user-agent: Forleads-Agent-Scorecard/1.0",
        state.productionBaseline.endpoint
      ],
      { cwd: root, encoding: "utf8" }
    );
    assert(
      curl.status === 0,
      `production probe failed via fetch (${fetchError.message}) and curl (${curl.stderr.trim()})`
    );
    actual = JSON.parse(curl.stdout);
  }
  assert(actual.ok === expected.ok, `health ok mismatch: ${actual.ok}`);
  assert(
    actual.productionPolicy?.mockConnectorWritesAllowed === false,
    "production permits mock connector writes"
  );
  assert(
    Array.isArray(actual.productionPolicy?.liveModeViolations) &&
      actual.productionPolicy.liveModeViolations.length === 0,
    `live-mode violations: ${JSON.stringify(actual.productionPolicy?.liveModeViolations)}`
  );
  for (const [mode, value] of Object.entries(expected.modes)) {
    assert(actual.modes?.[mode] === value, `${mode} expected ${value}, received ${actual.modes?.[mode]}`);
  }
  console.log(JSON.stringify(actual));
}

function runCommand(check) {
  return new Promise((resolve) => {
    const [command, ...args] = check.command;
    const started = Date.now();
    let output = "";
    let timedOut = false;
    activeChild = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const capture = (chunk, stream) => {
      const text = chunk.toString();
      output = `${output}${text}`.slice(-12000);
      stream.write(text);
    };
    activeChild.stdout.on("data", (chunk) => capture(chunk, process.stdout));
    activeChild.stderr.on("data", (chunk) => capture(chunk, process.stderr));

    const timer = setTimeout(() => {
      timedOut = true;
      activeChild?.kill("SIGTERM");
      setTimeout(() => activeChild?.kill("SIGKILL"), 3000).unref();
    }, check.timeoutMs);

    activeChild.on("close", (code, signal) => {
      clearTimeout(timer);
      activeChild = null;
      resolve({
        code,
        signal,
        timedOut,
        durationMs: Date.now() - started,
        outputTail: output.trim().split("\n").slice(-40)
      });
    });
  });
}

async function runScorecard() {
  const { state, config } = validateContract();
  activeRun = {
    schemaVersion: 1,
    runId: `scorecard-${Date.now()}`,
    name: config.name,
    status: "running",
    startedAt: now(),
    finishedAt: null,
    currentCheck: null,
    repositoryAtStart: repoSnapshot(),
    checks: config.checks.map((check) => ({
      ...check,
      command: check.command,
      status: "pending",
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      exitCode: null,
      signal: null,
      outputTail: []
    }))
  };
  persist(state, config, activeRun);

  for (const check of activeRun.checks) {
    if (interrupted) break;
    check.status = "running";
    check.startedAt = now();
    activeRun.currentCheck = check.id;
    persist(state, config, activeRun);

    console.log(`\n=== ${check.label} ===`);
    const result = await runCommand(check);
    check.finishedAt = now();
    check.durationMs = result.durationMs;
    check.exitCode = result.code;
    check.signal = result.signal;
    check.outputTail = result.outputTail;
    check.status = result.timedOut
      ? "timed_out"
      : interrupted
        ? "interrupted"
        : result.code === 0
          ? "passed"
          : "failed";
    persist(state, config, activeRun);
    if (check.required && check.status !== "passed") break;
  }

  const hasFailure = activeRun.checks.some((check) =>
    ["failed", "timed_out"].includes(check.status)
  );
  activeRun.currentCheck = null;
  activeRun.finishedAt = now();
  activeRun.status = interrupted ? "interrupted" : hasFailure ? "failed" : "passed";
  activeRun.repositoryAtFinish = repoSnapshot();
  activeRun.summary = scoreSummary(activeRun, config);
  persist(state, config, activeRun);

  console.log(
    `\nScorecard ${activeRun.status}: ${activeRun.summary.score}/100 (${activeRun.summary.grade}), requiredPassed=${activeRun.summary.requiredPassed}`
  );
  process.exitCode = activeRun.status === "passed" ? 0 : 1;
}

function handleInterruption(signal) {
  if (interrupted) return;
  interrupted = true;
  if (activeRun) {
    const running = activeRun.checks.find((check) => check.status === "running");
    if (running) {
      running.status = "interrupted";
      running.finishedAt = now();
    }
    activeRun.status = "interrupted";
    activeRun.currentCheck = null;
    activeRun.finishedAt = now();
    try {
      const { state, config } = validateContract();
      persist(state, config, activeRun);
    } catch (error) {
      console.error(`Could not persist interruption: ${error.message}`);
    }
  }
  activeChild?.kill(signal);
  process.exitCode = 130;
}

process.on("SIGINT", () => handleInterruption("SIGINT"));
process.on("SIGTERM", () => handleInterruption("SIGTERM"));

const command = process.argv[2] ?? "checkpoint";

try {
  if (command === "verify") {
    validateContract();
    console.log("Agent checkpoint contract is valid.");
  } else if (command === "verify-production") {
    await verifyProduction();
  } else if (command === "checkpoint") {
    const { state, config } = validateContract();
    persist(state, config, loadScorecardIfPresent());
    console.log("Wrote .agent/CHECKPOINT.json and .agent/SESSION_HANDOFF.md");
  } else if (command === "scorecard") {
    await runScorecard();
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
