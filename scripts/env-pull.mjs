#!/usr/bin/env node
// ============================================================================
// Preflight-guarded `vercel env pull`. If the folder is NOT linked yet, refuses
// to run rather than letting `vercel env pull` trigger a "create new project"
// prompt that could land in the wrong Vercel project. Tells the operator to
// run `npm run env:link` first.
// ============================================================================
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { exit } from "node:process";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const VERCEL_DIR = resolve(ROOT, ".vercel");
const isLinked = () => existsSync(resolve(VERCEL_DIR, "project.json")) || existsSync(resolve(VERCEL_DIR, "repo.json"));
const env = process.argv[2] === "production" ? "production" : process.argv[2] === "preview" ? "preview" : "development";

const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

if (!isLinked()) {
  console.error(yellow("\n  ✗ this folder isn't linked to a Vercel project yet."));
  console.error(dim("    Running `vercel env pull` from here would prompt you to CREATE a new"));
  console.error(dim("    project — which could be the wrong target.\n"));
  console.error(bold("    Run first:  ") + "npm run env:link\n");
  exit(1);
}

const child = spawn("npx", ["vercel", "env", "pull", ".env.local", `--environment=${env}`], { stdio: "inherit", cwd: ROOT });
child.on("exit", (code) => exit(code ?? 0));
