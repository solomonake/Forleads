import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const root = process.cwd();

export function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

export function exists(file) {
  return fs.existsSync(path.join(root, file));
}

export function run(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    env: process.env,
  });
  return {
    command: [command, ...args].join(" "),
    status: result.status ?? 1,
    ms: Date.now() - started,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function parseArg(name, fallback = "") {
  const direct = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

export function printSummary(title, rows) {
  console.log(`\n${title}`);
  for (const row of rows) {
    console.log(`${row.ok ? "PASS" : row.warn ? "WARN" : "FAIL"} ${row.label}${row.detail ? ` - ${row.detail}` : ""}`);
  }
}
