#!/usr/bin/env node
// ============================================================================
// Safe wrapper around `vercel link`. Prints the EXACT answers to give so we
// link to the EXISTING Forleads Vercel project — never create a new empty one.
// Refuses to proceed if a different project is already linked (asks first).
// ============================================================================
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, exit } from "node:process";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
// Vercel CLI v33+ writes `.vercel/project.json`; v54+ uses `.vercel/repo.json`.
// Treat either as "linked".
const VERCEL_DIR = resolve(ROOT, ".vercel");
const PROJECT_JSON = resolve(VERCEL_DIR, "project.json");
const REPO_JSON = resolve(VERCEL_DIR, "repo.json");
const isLinked = () => existsSync(PROJECT_JSON) || existsSync(REPO_JSON);
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });

  if (isLinked()) {
    const path = existsSync(PROJECT_JSON) ? PROJECT_JSON : REPO_JSON;
    console.log(green(`\n  ✓ already linked  ${dim(`(${path.replace(ROOT, ".")})`)}\n`));
    rl.close();
    return;
  }

  console.log(bold("\n  Linking this folder to your EXISTING Vercel project."));
  console.log(dim("  GitHub repo: github.com/solomonake/Forleads\n"));
  console.log(bold("  When `vercel link` prompts you, answer:"));
  console.log("    • Set up “Forleads”?                          " + green("Y"));
  console.log("    • Which scope should contain your project?    " + green("(pick your personal scope)"));
  console.log("    • Link to existing project?                   " + bold(green("Y")) + dim("   ← critical: don’t accept the default 'create new'"));
  console.log("    • What’s the name of your existing project?   " + green("forleads") + dim("  (or whatever your Vercel dashboard shows)"));
  console.log();
  console.log(dim("  If you don’t know the project name, open https://vercel.com/dashboard"));
  console.log(dim("  and look at the Forleads project card.\n"));

  const go = (await rl.question("  Ready? [Y/n]: ")).trim().toLowerCase();
  rl.close();
  if (go === "n" || go === "no") {
    console.log(yellow("\n  Aborted. Run again when ready.\n"));
    return;
  }

  const child = spawn("npx", ["vercel", "link"], { stdio: "inherit", cwd: ROOT });
  child.on("exit", (code) => {
    if (code === 0 && isLinked()) {
      console.log(green(`\n  ✓ linked`));
      console.log(dim("  Next: npm run env:pull\n"));
    } else {
      console.log(yellow(`\n  vercel link exited ${code}. linked=${isLinked()}\n`));
    }
    exit(code ?? 0);
  });
}

main().catch((e) => {
  console.error(`link failed: ${e?.message ?? e}`);
  exit(1);
});
