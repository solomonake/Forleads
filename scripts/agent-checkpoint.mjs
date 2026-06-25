import fs from "node:fs";
import path from "node:path";
import { parseArg, root, run } from "./agent-lib.mjs";

function clean(value, fallback = "none") {
  const text = value.trim();
  return text === "" ? fallback : text;
}

const goal = clean(parseArg("goal", "Continue the current verified task"));
const completed = clean(parseArg("completed"));
const next = clean(parseArg("next"));
const blockers = clean(parseArg("blockers"));
const authority = clean(
  parseArg(
    "authority",
    "In-scope read, edit, test, branch, commit, push, and draft PR are allowed; secrets, spending, destructive actions, and external communication require the user.",
  ),
);
const proof = clean(parseArg("proof"));
const branch = clean(
  run("git", ["branch", "--show-current"], { capture: true }).stdout,
  "detached",
);
const commit = clean(
  run("git", ["rev-parse", "--short=12", "HEAD"], { capture: true }).stdout,
  "unknown",
);
const status = run("git", ["status", "--short"], { capture: true }).stdout.trim();
const changed = status
  ? status.split("\n").map((line) => `  - ${line}`).join("\n")
  : "  - none";
const timestamp = new Date().toISOString();

const markdown = `# Current agent checkpoint

Generated: ${timestamp}

## State
- Branch: \`${branch}\`
- Commit: \`${commit}\`
- Worktree: ${status ? "dirty" : "clean"}
- Changed files:
${changed}

## Goal
${goal}

## Completed
${completed}

## Next exact action
${next}

## Blockers
${blockers}

## Authority
${authority}

## Verification proof
${proof}

## Cold-start sequence
1. Read \`AGENTS.md\`, \`.agent/AGENT_OS.md\`, this checkpoint, and the linked plan.
2. Run \`npm run agent:doctor\`.
3. Verify the branch/commit and inspect only the changed or referenced files.
4. Re-run the cheapest proof for the risky seam before editing.
5. Continue from **Next exact action**; do not restart discovery unless the evidence is stale.
`;

const output = path.join(root, ".agent", "handoffs", "current.md");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, markdown);
console.log(`[agent:checkpoint] wrote ${path.relative(root, output)}`);
console.log(markdown);

