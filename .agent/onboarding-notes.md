# Agent onboarding notes — Forleads

- **Stack:** Next.js 14 (App Router) + TypeScript + React 18. Package manager: **npm**.
- **Commands:** install=`npm i` · dev=`npm run dev` · test=`npm test` (vitest, single-fork) ·
  typecheck=`npm run typecheck` · build=`npm run build` · lint=`npm run lint`.
- **Git:** remote=`https://github.com/solomonake/Forleads.git` · default branch=`main` ·
  identity name=`Solomon` email=`solomonriting@gmail.com` · **auto-push post-commit hook = YES**
  (every commit self-pushes). gh CLI authed as `solomonake`; `gh auth setup-git` is configured.
- **Host:** Vercel (web) at https://forleads.vercel.app + Supabase project
  `vszyarwkjujvicilylqr` (anon key provided; **migrations NOT yet run**; micro RAM tier).
- **Gotchas:**
  - The production `npm run build` STALLS locally on this machine (maplibre-gl + webpack optimize
    pass exhausts RAM → 0% CPU hang). It builds fine on Vercel. To verify locally, run `npm run dev`
    and smoke-test endpoints (`bash scripts/smoke.sh`) instead of building.
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
