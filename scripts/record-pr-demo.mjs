#!/usr/bin/env node
// Records a PR demo and posts it to the PR.
//
// UI mode: runs the Playwright spec against a deployed preview URL and uploads
//   the resulting .webm as a PR comment attachment (via `gh release upload`).
// Backend-only mode: when the diff touches no UI files, records a `curl` trace
//   transcript against the preview URL and posts that instead — never errors.
//
// Env:
//   PR_NUMBER             — the PR to comment on (required when --post is set)
//   PR_DEMO_BASE_URL      — explicit preview URL (overrides auto-detect)
//   GITHUB_REPOSITORY     — owner/repo (defaults to `gh repo view` lookup)
//   VERCEL_PROJECT        — vercel project name for `vercel ls` lookup
// Flags:
//   --post                — actually post to the PR (otherwise prints locally)
//   --base-sha <sha>      — diff base (defaults to origin/main)

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const VIDEO_DIR = join(REPO_ROOT, ".playwright", "videos");
const TRACE_DIR = join(REPO_ROOT, ".playwright", "traces");

const args = new Set(process.argv.slice(2));
const POST = args.has("--post");

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts }).trim();
}

function tryShell(cmd) {
  try { return sh(cmd); } catch { return ""; }
}

// ---- 1. UI vs backend-only detection -------------------------------------
const UI_GLOBS = [
  /^src\/app\/.*\.(tsx|css)$/,
  /^src\/components\/.*\.(tsx|css)$/,
  /^src\/lib\/design\//,
  /^public\//,
  /^prototype\//,
];

function getBaseSha() {
  const idx = process.argv.indexOf("--base-sha");
  if (idx > -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return tryShell("git rev-parse origin/main") || "HEAD~1";
}

function changedFiles(base) {
  const out = tryShell(`git diff --name-only ${base}...HEAD`);
  return out ? out.split("\n").filter(Boolean) : [];
}

const baseSha = getBaseSha();
const changed = changedFiles(baseSha);
const uiTouched = changed.some((f) => UI_GLOBS.some((re) => re.test(f)));
const mode = uiTouched ? "ui" : "backend";

console.log(`[pr-demo] base=${baseSha} files=${changed.length} mode=${mode}`);

// ---- 2. Resolve preview URL ----------------------------------------------
function resolvePreviewUrl() {
  if (process.env.PR_DEMO_BASE_URL) return process.env.PR_DEMO_BASE_URL;
  // Try `vercel ls --json` — best-effort, project name optional.
  const project = process.env.VERCEL_PROJECT || "";
  const raw = tryShell(`vercel ls ${project} --json 2>/dev/null | head -c 100000`);
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      const first = Array.isArray(arr) ? arr[0] : arr?.deployments?.[0];
      if (first?.url) return `https://${first.url}`;
    } catch { /* fall through */ }
  }
  return "";
}

const baseURL = resolvePreviewUrl();
if (!baseURL && mode === "ui") {
  console.warn("[pr-demo] no preview URL available; falling back to backend-only transcript");
}

mkdirSync(VIDEO_DIR, { recursive: true });
mkdirSync(TRACE_DIR, { recursive: true });

// ---- 3. Record artifact ---------------------------------------------------
let artifactPath = "";
let summary = "";

if (mode === "ui" && baseURL) {
  console.log(`[pr-demo] running Playwright against ${baseURL}`);
  const result = spawnSync(
    "npx",
    ["playwright", "test", "--reporter=list"],
    { cwd: REPO_ROOT, stdio: "inherit", env: { ...process.env, PR_DEMO_BASE_URL: baseURL } },
  );
  if (result.status !== 0) {
    console.warn("[pr-demo] Playwright run failed; falling back to backend transcript");
  }
  const video = findLatestVideo();
  if (video) {
    artifactPath = video;
    summary = `### Demo video\n\nRecorded UI flow against ${baseURL}\n\nFlow: address → fly-to → grade chips → "Knocked, no answer" → draft\n`;
  }
}

if (!artifactPath) {
  const trace = recordBackendTrace(baseURL || "http://localhost:3000");
  const tracePath = join(TRACE_DIR, `backend-${Date.now()}.txt`);
  writeFileSync(tracePath, trace);
  artifactPath = tracePath;
  summary = `### Backend transcript\n\nNo UI files changed (or UI recording unavailable). Curl trace below.\n\n\`\`\`\n${trace}\n\`\`\`\n`;
}

console.log(`[pr-demo] artifact=${artifactPath}`);

// ---- 4. Post to PR --------------------------------------------------------
if (POST) {
  const pr = process.env.PR_NUMBER;
  if (!pr) {
    console.error("[pr-demo] PR_NUMBER not set; cannot post");
    process.exit(1);
  }
  postToPR(pr, artifactPath, summary);
} else {
  console.log("[pr-demo] --post not set; printing summary:\n");
  console.log(summary);
}

// ---- helpers --------------------------------------------------------------
function findLatestVideo() {
  if (!existsSync(VIDEO_DIR)) return "";
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const webms = walk(VIDEO_DIR).filter((p) => p.endsWith(".webm"));
  if (!webms.length) return "";
  webms.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return webms[0];
}

function recordBackendTrace(url) {
  const targets = ["/api/health", "/api/dispatch", "/"];
  const lines = [`# Backend smoke trace (no UI changes detected)`, `# base: ${url}`, ""];
  for (const path of targets) {
    const full = url.replace(/\/$/, "") + path;
    const cmd = `curl -sS -o /dev/null -w "%{http_code} %{time_total}s ${full}\\n" --max-time 15 ${full}`;
    lines.push(`$ ${cmd}`);
    lines.push(tryShell(cmd) || "(no response)");
    lines.push("");
  }
  return lines.join("\n");
}

function postToPR(pr, file, body) {
  if (file.endsWith(".webm")) {
    // Upload to a per-PR release and reference the asset URL in the comment.
    const tag = `pr-demo-${pr}-${Date.now()}`;
    const repo = process.env.GITHUB_REPOSITORY || tryShell("gh repo view --json nameWithOwner -q .nameWithOwner");
    tryShell(`gh release create "${tag}" --repo "${repo}" --notes "PR #${pr} demo recording" --prerelease`);
    tryShell(`gh release upload "${tag}" "${file}" --repo "${repo}" --clobber`);
    const assetUrl = `https://github.com/${repo}/releases/download/${tag}/${file.split("/").pop()}`;
    const fullBody = `${body}\n\n[Download .webm](${assetUrl})\n`;
    spawnSync("gh", ["pr", "comment", pr, "--body", fullBody], { stdio: "inherit" });
  } else {
    spawnSync("gh", ["pr", "comment", pr, "--body-file", file], { stdio: "inherit" });
  }
}
