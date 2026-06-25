import { parseArg, run } from "./agent-lib.mjs";

const goal = parseArg("goal", "Continue the current Product Engineering OS task");
const branch = run("git", ["branch", "--show-current"], { capture: true }).stdout.trim() || "detached";
const status = run("git", ["status", "--short"], { capture: true }).stdout.trim();
console.log(`# Session Handoff

## State
- Branch: ${branch}
- Worktree: ${status ? "dirty" : "clean"}
- Changed files:
${status ? status.split("\n").map((line) => `  - ${line}`).join("\n") : "  - none"}

## Goal
${goal}

## Required Entry
- Read AGENTS.md, .agent/AGENT_OS.md, .agent/playbook.md, and .agent/decisions.md.
- Run npm run agent:doctor before editing.
- Generate a context pack with npm run agent:context -- --intent="<task>" --risk=<tier> --paths=<paths>.

## Safety
- Stop rather than push if mandatory gates are unresolved.
- Merge, deploy, spend, production mutation, and external communication require human approval.
`);
