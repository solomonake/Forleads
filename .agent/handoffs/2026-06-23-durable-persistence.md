# Archived session handoff - durable persistence

_Updated 2026-06-23. Paste this into a fresh window to continue without dragging
the old transcript. Read `AGENT_OS.md` + `playbook.md` first (small, dense)._

## State
- **Branch:** `feat/durable-supabase-persistence` · **PR:** #1 (open) ·
  github.com/solomonake/Forleads. Auto-push hook on. Live: forleads.vercel.app.
- **Gates green:** typecheck · lint · 38 tests. Don't prod-build locally (→ gotchas).

## Done this session
1. **Durable Supabase persistence** — `SupabaseRepository` wired; schema+RLS+geo
   helpers applied (migrations 0002/0003/0004). RLS now ON for all 14 tables
   (was a live security hole). Verified geo round-trip via MCP.
2. **Liquid-glass UI pass** — tokens + globals.css; verified via screenshots.
3. **Real OSM ready** — provider implemented; fixed a real bug (missing
   `User-Agent` → Overpass 406). Flip with `FORLEADS_PROPERTY_PROVIDER=osm`.
4. **Agent OS** — this `.agent/` knowledge graph created.

## Next chunk (ready to execute)
→ `plans/live-claude.md` — wire live Claude into composer + notes classifier,
template fallback, compliance stays fail-closed. Read the `claude-api` skill first.

## Human-in-the-loop — Solomon's to-dos (exact steps)
1. **Merge PR #1** → Vercel auto-deploys (UI + dormant persistence code).
2. **Turn on persistence** in Vercel → Settings → Environment Variables:
   `FORLEADS_PERSIST=supabase`, `NEXT_PUBLIC_SUPABASE_URL=https://vszyarwkjujvicilylqr.supabase.co`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>`, `SUPABASE_SERVICE_ROLE_KEY=<service_role>` → redeploy.
3. **Turn on real OSM** in Vercel env: `FORLEADS_PROPERTY_PROVIDER=osm`.
4. **(For live Claude)** Vercel env: `ANTHROPIC_API_KEY=<console.anthropic.com>` + `FORLEADS_AGENT_MODE=live`.

## Pending decision
- GitHub branch ruleset "Agentic" — recommendation given (require PR + status
  checks to `main`, block force-push, keep app bypass list). Awaiting Solomon's
  go to finalize, then add a CI workflow so status checks exist to require.
