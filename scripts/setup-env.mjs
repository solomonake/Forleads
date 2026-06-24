#!/usr/bin/env node
// ============================================================================
// Interactive .env.local setup. Walks the operator through each missing key
// with: what it's for, the fastest signup link, paste prompt, and validation.
// Auto-generates SESSION_SECRET. Refuses to overwrite a populated value
// unless --force. At the end, offers to push the resulting env to Vercel.
// ============================================================================
import { createInterface } from "node:readline/promises";
import { stdin, stdout, exit } from "node:process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const force = process.argv.includes("--force");
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const ENV_LOCAL = resolve(ROOT, ".env.local");
const ENV_EXAMPLE = resolve(ROOT, ".env.example");

const rl = createInterface({ input: stdin, output: stdout });
const ask = (q) => rl.question(q);
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

// ---- The required env vars + how to get each one ---------------------------
// Order matters: cheap/free first, OAuth last (slowest to set up).
const STEPS = [
  {
    key: "ANTHROPIC_API_KEY",
    why: "The brain. Dispatcher / scouts / composer / compliance linter all call Claude.",
    url: "https://console.anthropic.com/ → Settings → API Keys → Create Key",
    hint: "Starts with `sk-ant-`. $5 free credit covers ~1500 drafts on Sonnet 4.6.",
    validate: (v) => v.startsWith("sk-ant-") || "Expected a key starting with `sk-ant-`.",
    requiredFor: "agent mode = live",
  },
  {
    key: "MAPILLARY_TOKEN",
    why: "Street-level imagery (the Imagery Scout). Free tier covers solo testing.",
    url: "https://www.mapillary.com/dashboard/developers → Register Application",
    hint: "Client token, alphanumeric. Imagery Scout falls back to Esri if blank.",
    validate: (v) => v.length > 20 || "Token looks too short.",
    optional: true,
  },
  {
    key: "SESSION_SECRET",
    why: "Encrypts the login session cookie. Required in production.",
    url: null,
    hint: "Press ENTER to auto-generate one (recommended).",
    autogen: () => randomBytes(32).toString("hex"),
    requiredFor: "Gmail OAuth login",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    why: "Supabase project URL (persistence).",
    url: "https://supabase.com/dashboard → your project → Settings → API → Project URL",
    hint: "Looks like `https://xxxxxxxxxxx.supabase.co`.",
    validate: (v) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(v) || "Expected `https://<id>.supabase.co`.",
    requiredFor: "persist = supabase",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    why: "Supabase publishable key for the client.",
    url: "Same Supabase page → API → `anon` `public` key",
    hint: "Long JWT-style string. Safe to ship to the browser.",
    validate: (v) => v.length > 40 || "Key looks too short.",
    requiredFor: "persist = supabase",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    why: "Server-only key with RLS-bypass. NEVER ship to the client.",
    url: "Same Supabase page → API → `service_role` `secret` key",
    hint: "Long JWT. The setup writes this to .env.local only — confirms it stays server-side.",
    validate: (v) => v.length > 40 || "Key looks too short.",
    requiredFor: "persist = supabase",
  },
  {
    key: "DATABASE_URL",
    why: "Direct Postgres connection string (for migrations + repo).",
    url: "Supabase → Settings → Database → Connection string → `URI`",
    hint: "Starts with `postgresql://`. Use the connection-pooler URL for Vercel.",
    validate: (v) => v.startsWith("postgres") || "Expected a `postgresql://...` URL.",
    requiredFor: "persist = supabase",
  },
  {
    key: "GOOGLE_CLIENT_ID",
    why: "Gmail send (approved drafts) + Calendar events. OAuth client ID.",
    url: "https://console.cloud.google.com/apis/credentials → Create Credentials → OAuth client ID (Web)",
    hint: "Ends in `.apps.googleusercontent.com`. Add redirect: http://localhost:3000/api/auth/google/callback",
    validate: (v) => v.endsWith(".apps.googleusercontent.com") || "Should end in `.apps.googleusercontent.com`.",
    requiredFor: "Gmail send",
  },
  {
    key: "GOOGLE_CLIENT_SECRET",
    why: "Pairs with GOOGLE_CLIENT_ID.",
    url: "Same Google Cloud page — shown next to the client ID.",
    hint: "Starts with `GOCSPX-`.",
    validate: (v) => v.startsWith("GOCSPX-") || "Should start with `GOCSPX-`.",
    requiredFor: "Gmail send",
  },
];

// Mode switches we flip on once the relevant keys are present.
const MODE_FLIPS = [
  { key: "FORLEADS_AGENT_MODE", value: "live", needs: ["ANTHROPIC_API_KEY"] },
  { key: "FORLEADS_PERSIST", value: "supabase", needs: ["DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] },
  { key: "FORLEADS_IMAGERY_PROVIDER", value: "mapillary", needs: ["MAPILLARY_TOKEN"] },
];

function parseEnv(text) {
  const out = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

function renderEnv(existing, updates) {
  // Preserve .env.example structure (comments + ordering), substitute values.
  const template = readFileSync(ENV_EXAMPLE, "utf8");
  const merged = new Map(existing);
  for (const [k, v] of updates) merged.set(k, v);
  return template
    .split("\n")
    .map((line) => {
      const m = line.match(/^([A-Z0-9_]+)=/);
      if (m && merged.has(m[1])) return `${m[1]}=${merged.get(m[1])}`;
      return line;
    })
    .join("\n");
}

async function main() {
  console.log(bold("\n  Forleads — credentials setup\n"));
  console.log(dim("  No secrets are echoed back to chat. They land in .env.local only.\n"));

  const existing = existsSync(ENV_LOCAL) ? parseEnv(readFileSync(ENV_LOCAL, "utf8")) : new Map();
  const updates = new Map();

  for (const step of STEPS) {
    const current = existing.get(step.key) ?? "";
    const skip = current && !force;
    console.log(bold(`\n  ${step.key}`) + (step.optional ? dim("  (optional)") : ""));
    console.log(`    ${step.why}`);
    if (step.url) console.log(`    ${dim("Get it:")} ${step.url}`);
    if (step.hint) console.log(`    ${dim("Hint:")} ${step.hint}`);
    if (skip) {
      console.log(green(`    ✓ already set — skipping (use --force to overwrite)`));
      continue;
    }

    let value;
    while (true) {
      const raw = (await ask(`    paste value${step.autogen ? " (or ENTER to auto-generate)" : ""}: `)).trim();
      if (!raw && step.autogen) {
        value = step.autogen();
        console.log(green(`    ✓ auto-generated`));
        break;
      }
      if (!raw && step.optional) {
        console.log(yellow(`    ⤳ skipped (optional)`));
        value = "";
        break;
      }
      if (!raw) {
        console.log(red(`    required — paste a value or Ctrl+C to abort`));
        continue;
      }
      const v = step.validate ? step.validate(raw) : true;
      if (v !== true) {
        console.log(red(`    ✗ ${v}`));
        continue;
      }
      value = raw;
      break;
    }
    if (value) updates.set(step.key, value);
  }

  // Flip mode switches whose dependencies are satisfied (existing OR just-set).
  const all = new Map([...existing, ...updates]);
  for (const flip of MODE_FLIPS) {
    if (flip.needs.every((k) => (all.get(k) ?? "").length > 0)) {
      const before = all.get(flip.key) ?? "";
      if (before !== flip.value) {
        updates.set(flip.key, flip.value);
        console.log(green(`\n  ↪ flipping ${flip.key}=${flip.value}`));
      }
    }
  }

  if (updates.size === 0) {
    console.log(yellow("\n  Nothing changed. .env.local is up to date.\n"));
    rl.close();
    return;
  }

  const next = renderEnv(existing, updates);
  writeFileSync(ENV_LOCAL, next, { mode: 0o600 });
  console.log(green(`\n  ✓ wrote ${ENV_LOCAL} (${updates.size} updated)\n`));

  const push = (await ask("  Push these to Vercel (dev/preview/prod) now? [y/N]: ")).trim().toLowerCase();
  if (push === "y" || push === "yes") {
    console.log(dim("\n  Running: npx vercel-env-push .env.local development preview production\n"));
    const child = spawn("npx", ["vercel-env-push", ".env.local", "development", "preview", "production"], {
      stdio: "inherit",
      cwd: ROOT,
    });
    child.on("exit", (code) => {
      console.log(code === 0 ? green("\n  ✓ Vercel envs pushed.\n") : red(`\n  vercel-env-push exited ${code}\n`));
      rl.close();
      exit(code ?? 0);
    });
    return;
  }
  console.log(dim("\n  Skipped Vercel push. Run later with: npm run env:push\n"));
  rl.close();
}

main().catch((e) => {
  console.error(red(`\n  setup failed: ${e?.message ?? e}\n`));
  rl.close();
  exit(1);
});
