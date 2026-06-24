# Forleads — Capacity Envelope (2026-06-23)

**No naked numbers** — each figure carries a source and confidence A–D. Where a
number depends on an unverifiable prod secret (Vercel plan, which env flags are
set), it is graded down and the assumption is stated. Grounded by reading
`dispatcher.ts`, `providers/index.ts`, `providers/real.ts`, `scouts.ts`, and the
live prod build (`dpl_1eSAuWUCnbWPF6AAy9g55giux44a`, READY).

## TL;DR
Capacity is **regime-dependent**, set by two env flags:
- `FORLEADS_PROPERTY_PROVIDER` (default `osm-mock` → no external calls; `osm` → live Overpass)
- `FORLEADS_AGENT_MODE` (default `mock` → no Claude; `live` → Claude with total fallback)

| Regime | Binding constraint | Lead-discovery throughput | List/read throughput |
|--------|--------------------|---------------------------|----------------------|
| **Mock** (current default) | Vercel function concurrency | compute-bound, ~**100s/min** | ~**100s/min** |
| **Live** (`osm` + `live`) | **Overpass fair-use** (shared egress IP) | ~**15–40 new leads/min globally** | ~**100s/min** (unaffected) |

Confidence on the headline: **C** (Vercel plan + prod env flags unverified; the
*shape* of the constraint is **B**, grounded in code).

---

## The request taxonomy (grounded in the routes)
Three cost classes, because they bind on different resources:

1. **Cheap reads** — `GET /api/leads,/inbox,/loops,/report,/connectors`. One
   PostgREST round-trip (Supabase) or in-memory. No external API, no LLM.
   *Binds on:* Vercel function concurrency. (evidence: `leads/route.ts` etc.)
2. **Compose mutations** — `POST /api/notes,/draft`. May call Claude
   (`classifyNoteBest`/`composeBest`) **only in live regime**; degrades to a
   deterministic template on ANY throw incl. a 429 (playbook: "total fallback").
   *Binds on:* Anthropic RPM — but **soft** (degrades, never fails).
3. **Discovery** — `POST /api/lead` → the scout swarm. The dispatcher always adds
   `property`, `imagery`, `risk` scouts (+`people` for new, +`market`)
   (`dispatcher.ts:58-72`). In the **live OSM regime**, `property` →
   `OSMPropertyProvider.facts()` = **1 Overpass POST** (`real.ts:75`), `imagery` →
   Mapillary if `MAPILLARY_TOKEN` set = 1 more; the rest emit mock/gap cards with
   no external call. So **1–2 external calls per lead-open** (confidence **B**).
   *Binds on:* **Overpass fair-use** — the binding constraint of the whole system.

---

## Why Overpass is the binding constraint (live regime)
All Vercel functions egress from a **shared pool of IPs**, so the entire app
shares **one** OSM Overpass fair-use budget. Overpass public-instance policy:
~**1 req/s sustained**, ~**2 concurrent**, soft daily cap (source: OSM Overpass
API usage policy — confidence **B**). With ~1 Overpass call per lead-open:

```
Overpass sustained ≈ 1 req/s  ÷  ~1 Overpass call/lead  ≈ 1 lead-open/s
                   ≈ 60 lead-opens/min  (theoretical ceiling, single instance)
```

Real-world derate for the soft per-minute throttling and the 2-concurrent cap
puts sustainable global discovery at **~15–40 new lead-opens/min** (confidence
**C** — the derate factor is estimated, not measured). Critically this is a
**global** number shared across ALL users, not per-user — one abuser opening
leads in a tight loop starves discovery for everyone (this is exactly why
rate-limiting, audit axis 4, is ROI #2).

Translating to concurrent users: if an active agent opens a *new, uncached* lead
roughly every ~30s, ~15–40/min supports **~8–20 simultaneously-discovering
users** before Overpass throttles — while **browsing/list users scale to the
hundreds** (they never touch Overpass). Confidence **C**.

## What is NOT the binding constraint
- **Supabase connections.** The repo talks to Supabase over **PostgREST/HTTPS**
  (`supabase-js`), not raw PG connections — PostgREST pools server-side, so the
  free-tier direct-connection limit (~60) is not hit by the API layer
  (confidence **B**, from `supabase-repo.ts` using `createClient`).
- **Anthropic rate.** Real but **soft** — `composeBest`/`classifyNoteBest` fall
  back to templates on 429, so a rate hit degrades quality, not availability
  (confidence **A**, playbook + `claude.ts`).
- **Vercel concurrency** only binds the cheap-read class; documented defaults are
  generous (Pro: ~1000 concurrent functions). Plan unverified → confidence **C**.

---

## How to raise capacity cheaply (≈ $0)
Ordered by ROI, ties back to the audit:

1. **Cache-first by H3 (audit axis 5).** Cache Overpass/evidence results keyed by
   `h3Key` with a TTL. An agent farms the same blocks repeatedly → high cache-hit
   rate → most lead-opens stop hitting Overpass → the binding constraint shifts
   from Overpass back to Vercel concurrency, multiplying live-regime discovery
   capacity **~5–50×** (confidence **C**; hit-rate is workload-dependent). This is
   the single highest-leverage capacity move and is **already mandated by
   constitution §10** — currently aspirational.
2. **Rate limiting (audit axis 4).** A per-IP+agent token bucket on `/api/lead`
   protects the shared Overpass budget so one caller can't starve all users;
   converts a global cliff into a fair per-tenant share.
3. **Self-hosted / paid Overpass tile or a per-market `PropertyDataProvider`.**
   Removes the shared-IP fair-use ceiling entirely for hot markets (the seam
   already exists — `getPropertyProvider()`); a cost trade, deferred until demand.

---

## Grade
**Capacity readiness: C.** The architecture degrades gracefully (mock floor, LLM
fallback) and the *binding constraint is identified and grounded*, but: (a) the
live regime has **no cache** so it cliffs at a low global Overpass ceiling, and
(b) **no rate limiting** means that ceiling is exploitable by a single caller.
Both are the next two remediations in `2026-06-23-prod-readiness.md`. Shipping the
H3 cache moves this axis to **B**; cache + rate-limit + a verified Vercel plan
moves it to **A**.

> Numbers to *measure* before trusting this past confidence C: actual Vercel plan
> + concurrency limit; which prod env flags are set (`FORLEADS_PROPERTY_PROVIDER`,
> `FORLEADS_AGENT_MODE`, `FORLEADS_PERSIST`); a load test at 10/50/100 concurrent
> `POST /api/lead` to measure the real Overpass derate factor.
