# Phase 0 — open-decisions resolutions (2026-06-30)

User authority granted for this session: "Pick what scores best on cost-per-call
+ coverage and proceed" (provider pick) + "Everything. The whole product"
(scope). Per `[[autonomy-preference]]` P2: execute reversible defaults; only
escalate genuine blockers.

39 resolved here. 5 deferred to user (see bottom).

## WS-A · Live property/owner data

| # | Decision | Resolution | Why |
|---|---|---|---|
| A1 | Provider choice | **ATTOM** | US coverage + owner+structure+sale in one feed (~$0.02–0.05/lookup). User-delegated. Reversible behind the existing `propertyProvider` seam. |
| A2 | Per-tenant daily spend cap | **`ATTOM_DAILY_CAP_USD=5`** default | ~100 detail lookups/day. Configurable env var; raising it is a non-code change. |
| A4 | Cache backend | **In-memory for v1**, durable Supabase table deferred to a WS-M follow-up | Graded-B caveat honest. Pulling WS-M forward adds a migration to the WS-A PR — bad seam. |
| A3 | Owner full name surfacing in EvidenceCards | **DEFERRED** | Fair-housing / PII posture — founder call. |

## WS-B · FEMA NFHL risk

| # | Decision | Resolution | Why |
|---|---|---|---|
| B1 | Card copy | **`claim: "Flood zone", value: "AE — high-risk SFHA"`** | Two-axis facts inside one card matches existing EvidenceCard shape; "high-risk SFHA" is plain-English without alarming. |
| B2 | Deep-link to FEMA NFHL viewer | **Yes**, append `?lng={x}&lat={y}` to the layer URL | Citation moat — clickable source > opaque URL. Zero engineering cost. |
| B3 | Allowlist source | **Extend in `src/lib/agents/dispatcher.ts:28`** | Existing pattern; don't promote prematurely. |

## WS-C · Comps scoring

| # | Decision | Resolution | Why |
|---|---|---|---|
| C1 | Radius / max-age | **1500m / 540d global v1** | Per-market tuning is a workspace-config story — premature without traction signal. |
| C2 | Score weights | **0.5 proximity / 0.3 recency / 0.2 size** v1 (constants, exposed later) | Defensible default; expose when a client asks. |
| C3 | Missing subject living-area | **No penalty (similarity=1) AND cap resulting grade at B** | Combines both intuitions; never lets a fully-graded A pass on missing data. |

## WS-D · Onboarding wizard

| # | Decision | Resolution | Why |
|---|---|---|---|
| D1 | Re-run onboarding entry | **Defer to follow-up PR** | First-run only for v1; reset flow is operator-grade not user-blocker. |
| D2 | Top-20 pre-warm ranking | **Heuristic: `hasPhone + hasEmail + addressSpecificity`** | Anything richer needs a feedback signal we don't have yet. |
| D3 | Row hard cap | **2000 rows accepted for Friday client** | Background-job design is WS-M material; gracefully reject >2000 with a clear error. |
| D4 | `farm_bbox` storage | **`jsonb [w,s,e,n]`** v1 | WS-F watchers default to area-label equality (see F1); no PostGIS query needed yet. |

## WS-E · CRM overlay sync

| # | Decision | Resolution | Why |
|---|---|---|---|
| E1 | Multi-tenant | **Per-agent credential capture from day one** | User explicitly chose "full product." Env-var single-tenant blocks the real launch. |
| E2 | Geocoder | **Nominatim (existing seam) + aggressive H3 cache** for v1; Photon self-host tracked as WS-M follow-up | Existing pattern; smallest delta; "fragile" mitigated by cache + rate-limit retry already in place. |
| E3 | Overlay pin visual | **Unified pins with provenance chip in tooltip** | Distinct color is "in the design tax" without a designer; chip is honest + reversible. |

## WS-F · Watchers

| # | Decision | Resolution | Why |
|---|---|---|---|
| F1 | Area predicate v1 | **Case-insensitive equality on `lead.address.district === watcher.area_label`** | Simplest correct; PostGIS contains-point upgrade is one PR away. |
| F2 | Default cadence | **24h** | Vercel free-tier cron friendly; faster cadence is per-watcher config later. |
| F3 | In-app push/toast on hit | **Tray-only for v1** | Matches UC-4 wording ("pings the agent with a ready-to-send message" = the tray IS the ping). |

## WS-G · Drive-by farming

| # | Decision | Resolution | Why |
|---|---|---|---|
| G1 | Signal allowlist v1 | **tenure (years_owned/year_built) + land-use change + lawful public probate** | Exactly the UC-3 packet's guardrail set. |
| G2 | Drive session TTL | **4h hard stop** | Battery + privacy default; user can stop earlier. |
| G3 | `/farm` nav placement | **Sibling tab to MapWorkspace** | Discoverable; doesn't bloat the home map. |
| G4 | Ranker weights | **0.5 tenure / 0.3 land-use / 0.2 probate** | Mirrors WS-C weighting style; tunable later. |

## WS-H · Listing + ad creatives

| # | Decision | Resolution | Why |
|---|---|---|---|
| H1 | Live-Claude wrap for `listing_description` v1 | **Defer to v2 PR** | Deterministic-first proves the bundle; live wrap is a one-line flip. |
| H2 | Third social platform | **Instagram (Reels caption)** instead of X | Real-estate audience lives on IG, not X. |
| H3 | Neighbor letter format | **Postal body only** v1 | No email-send API dependency; postal-merge is the standard agent workflow. |
| H4 | Bundle re-roll | **New `bundleId` per retry** (safer audit) | Cleaner-Tray argument loses to audit truth; cleanup is a UI story. |

## WS-I · Seller-update synthesizer

| # | Decision | Resolution | Why |
|---|---|---|---|
| I1 | LeadStatus gate values | **`appointment | won`** | From `src/lib/core/types.ts:161`. `appointment` = under appointment with seller; `won` = listing signed. |
| I2 | Default `windowDays` | **14 days** | Weekly-feedback cadence too thin early in a listing; 14 reads as recent without false-empty. |
| I3 | Auto-append price-adjustment CTA | **Grade-A-only** | Compliance-safe; grade-B CTAs on price are risky language. |

## WS-J · Real send (CRITICAL)

| # | Decision | Resolution | Why |
|---|---|---|---|
| J1 | `session.role` derivation | **Re-derive server-side from `agent.role` on every `/api/admin/send-flag` call** | Defense-in-depth; cookie can be stale. Matches `requireAgentId()` pattern in `src/lib/auth/agent.ts`. |
| J2 | `send_flag.sms=false` behavior | **422 fail-closed** | Dry-run is operationally confusing. Honest UI = no silent success. |
| J3 | First tenant to enable `email.send` | **Operator's own tenant first** | Reputational risk; we get our own bounces. |
| J4 | Strip `payload.from` before Gmail send | **Preserve** for parity | Gmail overrides; preserving keeps logs identical to draft path. |

## WS-K · Vision (Gemini)

| # | Decision | Resolution | Why |
|---|---|---|---|
| K1 | Default model | **`gemini-2.5-flash`** | Lowest cost-per-call at acceptable quality. |
| K2 | Closed-set claim allowlist v1 | **`{style, condition, stories, materials, roof, landscaping}`** | Exact packet recommendation; never demographic-adjacent. |
| K3 | Per-tap spend acknowledgement | **Acknowledged** (≤$0.001 uncached × 6h scout cache) | Default cap inherits ws-a-style budget guard. |
| K4 | Production env flip timing | **DEFERRED** — build behind flag default OFF; flip is a separate post-merge gate | Founder + security review required per packet. |

## WS-M · Production hardening

| # | Decision | Resolution | Why |
|---|---|---|---|
| M2 | Error sink | **Sentry free tier** | Packet default; widely understood; DSN-based opt-in. |
| M4 | Daily quota ceiling | **5000/agent/day** default via `RATE_LIMIT_DAILY_QUOTA` | Generous for solo; reversible env var. |
| M5 | NorthStar in Weekly Report UI | **Defer to follow-up** | New endpoint + UI is double-work; ship endpoint v1, surface later. |
| M1 | Welcome email copy | **DEFERRED** | Founder voice required. |
| M3 | `FOUNDER_SUB` capture | **DEFERRED** | Only the user can capture their own Google `sub`. |

---

## User-supplied resolutions (2026-06-30 same session)

| # | Decision | User pick | Implementation note |
|---|---|---|---|
| A3 | Owner PII surfacing | **Surfaced in EvidenceCards — cited fact like any other** | Full owner name renders in lead rail as a grade-A EvidenceCard from ATTOM. Composer reads same source. Still gated by UC-12 compliance linter (no demographic derivation). |
| M1 | Welcome email | **Claude drafts 150-word welcome; founder edits before flip-on** | Draft saved to `.agent/drafts/welcome-email-v1.md`. Send remains gated by `WELCOME_EMAIL_ENABLED=true` flag. |
| M3 | `FOUNDER_SUB` capture | **Auto-bootstrap on first login matching `solomonriting@gmail.com`** | On successful Google login from configured `FOUNDER_EMAIL`, record `agent.role='founder'`. Bootstrap row writes once, idempotent. Audit log + security review required before merge. |

## Still deferred (merge-gate only, no Phase 1 block)

- **K4 — Vision prod env flip timing.** Ship behind flag default OFF; flip is a separate PR after security/compliance review.

## Audit

- Reversibility: every decision above is gated by a config env var or a single
  file edit. No durable schema commits driven by these choices yet.
- Records: this file + the `Decisions` field of `[[knowledge-graph-self-update]]`.
- Next: kick off Phase 1 (worktree-parallel mechanical builds for WS-B, WS-K,
  WS-I, and the WS-M landing+Sentry+quota slice).
