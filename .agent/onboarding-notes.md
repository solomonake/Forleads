# Agent onboarding notes — Forleads

- **Stack:** Next.js 14 (App Router) + TypeScript + React 18. Package manager: **npm**.
- **Commands:** install=`npm i` · dev=`npm run dev` · test=`npm test` (vitest, single-fork) ·
  typecheck=`npm run typecheck` · build=`npm run build` · lint=`npm run lint`.
- **Git:** remote=`https://github.com/solomonake/Forleads.git` · default branch=`main`.
  Never assume hooks, authentication, branch state, or push authority from this
  historical note; inspect the current worktree and follow `AGENTS.md`.
- **Host:** Vercel (web) at https://forleads.vercel.app + Supabase project
  `vszyarwkjujvicilylqr` (micro RAM tier). **Schema + RLS + geo helpers ARE NOW APPLIED**
  (migrations 0002_rls, 0003_geo_helpers, 0004_function_hardening, 0005_memories,
  0006_artifact_revisions, 0007_runtime_idempotency, 0008_connector_credentials,
  0009_outcome_memory, 0010_neighborhood_memory tracked; 0001 schema applied
  earlier out-of-band). 0005 was applied alongside 0006-0010 on 2026-06-25 — it had been
  skipped previously, which caused `fl_recall_memories` schema-cache misses in prod until
  the back-fill. All 15 app tables have RLS on; service-role key bypasses it (only path the
  app uses). `spatial_ref_sys` RLS + postgis/vector-in-public are accepted PostGIS exceptions.
  `fl_recall_memories` has explicit `set search_path = public, pg_temp` to silence the
  Supabase mutable-search-path advisor.
- **Persistence:** `SupabaseRepository` (src/lib/db/supabase-repo.ts) is a wired drop-in for the
  Repository interface; activates when `FORLEADS_PERSIST=supabase` AND `NEXT_PUBLIC_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` are present, else falls back to in-memory (logs a warning). Geo:
  writes via `fl_upsert_lead_surface` RPC, reads via generated `lng`/`lat` cols. Slug IDs (loop-*,
  conn-*) → stable uuid v5. Live geo round-trip verified via MCP. `@supabase/supabase-js` added.
- **Gotchas:**
  - A historical checkout saw local production builds stall during MapLibre optimization.
    Re-test before relying on that old diagnosis; do not report a build pass unless it finishes.
  - Run long commands with output redirected to a FILE, not piped to the harness, or stdout
    back-pressure stalls them.
  - vitest must run single-fork (set in vitest.config.ts) — integration tests share in-memory
    singletons.
  - `@vercel/analytics` needs `--legacy-peer-deps` (React 18); `.npmrc` pins this so Vercel installs.
- **Secrets needed (ask user; values live in Vercel env, never here):** `SESSION_SECRET`
  (openssl rand -hex 32), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`,
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`.
- **Provider posture:** everything runs in MOCK mode with zero creds; real adapters flip via env.
  See `src/lib/core/config.ts` (the single mock⇆live switch point).

## What worked / do better next time
- 2026-06-23: Built Google OAuth login (encrypted-cookie session, no DB needed) so approvals create
  real Gmail drafts; added Vercel analytics; created this skill. Next: run Supabase migrations +
  wire the Supabase-backed Repository for durable multi-user persistence.
