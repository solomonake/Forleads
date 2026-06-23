# 04 · Forleads — Agent Loops & Scouts (v1)

> This is the brain. It implements the converged principles: **bounded swarm**, **no naked numbers**, **note → next-best-action**, **one break-out never a loop**, **human-in-the-loop gate**.

## 1. Roles
| Agent | Model | Job | Budget (default) |
|---|---|---|---|
| **Dispatcher** | Claude | Decompose intent, pick scouts, set per-scout budgets, decide when done | 1 call, ≤ 4k tokens |
| **Property Scout** | Gemini Flash / Claude | Building, parcel, land-use, year, footprint | ≤ 2 source calls, 4 s, 2k tok |
| **Imagery Scout** | Gemini Flash (vision) | Mapillary street + Esri aerial + caption condition/style | ≤ 3 calls, 6 s, 3k tok |
| **People Scout** | Claude | Who to contact, lawful public-record signals only | ≤ 2 calls, 4 s, 2k tok |
| **Market Scout** | Claude | Comps & resale **graded**; via provider adapter | ≤ 3 calls, 6 s, 3k tok |
| **Risk Scout** | Gemini Flash | Flood/zoning/area context | ≤ 2 calls, 4 s, 2k tok |
| **Reducer** | Code + Claude (judgment) | Merge, de-dup, grade, detect conflict, decide break-out | 1 call, ≤ 3k tokens |
| **Composer** | Claude | Draft outreach in brand voice w/ evidence | 1 call, ≤ 3k tokens |
| **Compliance Linter** | Rules + Claude | Block protected-class targeting/inference | 1 call, ≤ 1k tokens |

## 2. The scout contract (the "no fabrication" guarantee)
Every scout returns **only** typed evidence cards or an explicit gap. It is *structurally impossible* to return a value without a source.

```ts
type Confidence = 'A' | 'B' | 'C' | 'D';
// A = official record / recent verified comp
// B = modeled from ≥3 independent signals
// C = sparse / single weak signal / heuristic
// D = insufficient evidence → SAY SO

interface EvidenceCard {
  scout: 'property'|'imagery'|'people'|'market'|'risk';
  claim: string;                 // "Building footprint ~ 180 m²"
  value: string | number | null; // null allowed ONLY with confidence 'D'
  sources: { name: string; url?: string; as_of?: string }[]; // ≥1 unless confidence 'D'
  confidence: Confidence;
  reasoning?: string;            // shown on "why this grade"
}

interface ScoutResult {
  scout: string;
  cards: EvidenceCard[];
  gaps: string[];                // honest "couldn't find X"
  cost: { ms: number; tokens: number; calls: number };
  status: 'ok' | 'partial' | 'insufficient_evidence' | 'budget_exceeded';
}
```
**Hard rule enforced in code:** if `confidence !== 'D'` then `sources.length >= 1 && value != null`. A scout that tries to violate this is rejected by the Reducer and logged.

## 3. Dispatcher logic
```
INPUT: lead_surface {address, geom, status, prior_memory_refs}
1. Retrieve prior memory for this surface/area (pgvector top-k).
2. Choose scouts by intent + data availability:
   - Always: Property, Imagery, Risk (cheap, global via OSM/Mapillary/Esri).
   - People: only if status ∈ {new, researching} and lawful sources configured.
   - Market: only if a PropertyDataProvider beyond OSM is available for this market,
             else emit a single grade-D "no market data source for {country}" card.
3. Assign budgets (tighten if agent near daily free-tier cap).
4. Fan out in parallel. Stream cards to client as they land.
OUTPUT: scout_jobs[] + budgets
```
**Why this is production-safe:** scouts never call each other; the Dispatcher is the only planner; budgets are hard ceilings; parallelism is bounded to ≤ 5.

## 4. The Reducer + the break-out rule (how they "break out", safely)
```
INPUT: ScoutResult[]
1. Validate every card against the contract; drop violators.
2. De-dup claims; when two sources agree → upgrade confidence; when they conflict → flag.
3. Compute an overall lead grade (worst-case weighting for money claims).
4. BREAK-OUT DECISION (max ONE, never recursive):
   IF a money/decision-critical claim is grade C/D OR sources conflict:
        choose the single highest-leverage resolution:
          (a) spawn ONE deeper scout with a 1-level-higher budget, OR
          (b) surface ONE crisp question to the human ("Is this a 3-bed? It changes the comp."),
        whichever is cheaper in expected time.
   ELSE: finalize.
5. Emit summary {cards, grade, gaps, breakout?}. Embed to memory.
```
- **No loops by construction:** break-out depth is capped at 1 and the deeper scout cannot itself break out. If still unresolved → the lead is finalized honestly as "best available, grade C, here's the gap." The product would rather say "I don't know" than spin.

## 5. Background "map scouts" (the ambient swarm)
When the agent pans/zooms a farm area (not a single tap), a **throttled** ambient pass runs *cheap-only* scouts (Property/Risk from OSM, no vision, no paid calls) over visible parcels to pre-warm the map with light signals (e.g., "likely long-tenure owner," "recently changed land-use"). Strictly budget-capped and cache-first so panning never costs real money. Tapping a surface promotes it to the full swarm.

## 6. Note → Next-Best-Action state machine
```
NOTE (text|voice) ─► classify SITUATION ─► pick ACTION TEMPLATE ─► COMPOSE ─► LINT ─► REVIEW TRAY ─► (human) APPROVE ─► SEND ─► LOG

Situations → default next-best-action:
  no_contact        → warm follow-up (email/handwritten-style letter) + retry task in N days
  interested_seller → CMA-prep packet + appointment-request draft + calendar hold
  objection:<type>  → objection-handling reply mapped to type (price/timing/agent-loyalty)
  buyer_criteria    → create/refine a Watcher + confirmation message
  needs_repair_info → request-for-info draft + contractor-referral note
  dead/not_now      → polite close + long-cycle nurture enrollment (e.g., 6-mo touch)
```
Each composed artifact includes: **sender identity + signature**, **recipient**, **subject**, **brand-voice body**, and the **evidence used** (so the agent can defend it). Status starts `drafted`; only a human tap moves it to `approved → sent`.

## 7. Guardrails (the production-grade part)
- **Budget ceilings** per scout + per-lead + per-agent-per-day; exceeding → graceful `budget_exceeded` card, never a silent overrun.
- **Source allowlist** per scout; an out-of-domain call is blocked.
- **No-fabrication contract** enforced at the type boundary (§2).
- **Compliance linter** runs before any artifact is approvable; blocks protected-class targeting/inference; flags unverifiable claims for the agent.
- **Human gate**: no auto-send in MVP. Period.
- **Idempotency + caching** by `h3_index` so retries and panning don't duplicate spend.
- **Observability**: every scout call logs `{cost, status, sources}`; a per-agent ledger shows daily spend vs. free-tier caps.
- **Determinism where possible**: merging/grading/dedup is code; the LLM is used only for genuine judgment (classification, drafting, conflict reasoning).

## 8. Example prompts (abridged — full versions live in code)
**Dispatcher (system):**
> You are the Dispatcher for Forleads. Given a lead surface, plan the minimum set of scouts to ground the most decision-relevant facts within budget. Prefer free global sources (OSM, Mapillary, Esri). Never instruct a scout to invent data. If no market data provider exists for this country, do not run Market Scout — emit a grade-D gap. Output strict JSON: `{scouts:[{type,budget,why}], memory_used:[...]}`.

**Any Scout (system):**
> You are the {TYPE} Scout. Use ONLY these sources: {ALLOWLIST}. Return EvidenceCards. You may NOT return a value without ≥1 source. If you cannot ground a claim, return it with confidence 'D', value null, and an honest gap. Stay within {BUDGET}. Output strict JSON matching the EvidenceCard schema.

**Composer (system):**
> Draft a {ACTION_TYPE} for {AGENT_NAME} to {RECIPIENT} about {ADDRESS}. Voice: {BRAND_VOICE}. Use only the EvidenceCards provided; cite nothing you weren't given. Include the agent's signature. Do not reference or infer any protected characteristic. Output `{subject, body, evidence_used[]}`. This is a DRAFT for human review; do not claim it has been sent.

**Compliance Linter (system):**
> Review this real-estate outreach for fair-housing compliance. Flag/score any content that targets or references protected classes (race, color, religion, sex, disability, familial status, national origin, or local equivalents) or that steers based on them. Return `{pass: boolean, flags:[{span, issue, fix}]}`. When unsure, fail closed.

## 9. Why this is *novel* but *works*
- **Novel:** the swarm is the UI (cards stream as theater), grounding is enforced at the type level, observations auto-compose reviewable actions, and the system is comfortable saying "I don't know."
- **Works:** single planner, bounded parallelism, one-level break-out, deterministic merge, hard budgets, allowlists, human gate, full observability. Nothing here is a research bet; it's the orchestrator–worker pattern with strict contracts.
