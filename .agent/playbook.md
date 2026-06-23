# Playbook — patterns & gotchas (read before acting)

## Reusable patterns (the moves that keep paying off)

- **Seam pattern.** Every external dependency (DB, AI, geocoder, property data,
  connectors) is a typed interface with a `mock` and a `real` adapter, chosen by
  one env var in `src/lib/core/config.ts`. "Going live" = setting a var, never a
  rewrite. When adding a new dependency, add the seam first.
- **No naked numbers.** Any value rendered carries `{sources[], confidence A–D}`.
  Providers return grade-D gaps instead of inventing facts. **Claude reasons;
  providers supply facts.** Never let the model be the source of a number.
- **Fix root cause, not symptom.** "Dummy data" wasn't fake content — it was an
  in-memory store resetting on serverless. The fix was persistence, not nicer
  fakes. Ask "why is it this way?" one level deeper than feels necessary.
- **Foundation before surface.** Persistence before UI polish. Beautiful UI on
  evaporating data is a demo that fails in front of a partner.
- **Verify the risky layer cheaply.** Probe the one thing most likely to break
  with a single call (a `curl`, a SQL round-trip) before trusting the whole app.
- **Security is found by tooling.** Run `get_advisors` after any change to a
  security boundary — it catches your *own* new holes (we revoked anon EXECUTE
  on functions we'd just added).

## Gotchas table (failures already solved — do NOT rediscover)

| Symptom | Cause | Fix |
|---|---|---|
| `npm run build` hangs at 0% CPU locally | maplibre-gl + webpack optimize exhausts low RAM | Don't prod-build locally. Verify via `npm run dev` + `bash scripts/smoke.sh`. It builds fine on Vercel CI. |
| Long command stalls with no output | harness stdout back-pressure | Redirect to a file: `cmd > /tmp/out.log 2>&1`, then read the file. |
| `npm test` flaky / cross-test bleed | integration tests share in-memory singletons | vitest pinned to single fork in `vitest.config.ts`. Keep it. |
| `npm i` peer-dep errors (React 18) | `@vercel/analytics` / supabase want newer peers | `.npmrc` pins `legacy-peer-deps=true`. Install with `--legacy-peer-deps`. |
| **Live OSM Overpass returns `406 Not Acceptable`** | **request sent without a `User-Agent` (OSM fair-use)** | **`OSMPropertyProvider` now sends a descriptive UA header. Any new OSM/Nominatim/Overpass call MUST set `User-Agent`.** |
| Supabase insert fails: `id` is not a valid uuid | seed slugs (`loop-no-contact`, `conn-google`) vs uuid PK | `supabase-repo.ts` maps non-uuid slugs → stable uuid v5 via `toUuid()`. |
| PostGIS geom can't be read/written over PostgREST | geography isn't inline-constructible via REST | Write via `fl_upsert_lead_surface` RPC; read via generated `lng`/`lat` columns (migration 0003). |
| Supabase advisor: "anon can execute SECURITY DEFINER fn" | new `SECURITY DEFINER` fn is public-callable by default | `REVOKE EXECUTE ... FROM public, anon, authenticated` (migration 0004). Re-run `get_advisors` after adding any function. |

## Verification quick-reference

- Gates: `npm run typecheck` · `npm run lint` · `npm test` (all must pass).
- Live DB layer: probe via Supabase MCP `execute_sql` (round-trip a row, then delete).
- UI: `preview_start` → `preview_screenshot` (the dev server, not a prod build).
- External provider: one `curl` against the real endpoint with correct headers.
