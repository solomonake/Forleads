# 10 · Forleads — Claude Code Handoff (v1)

> Paste-ready. This turns the whole `docs/` folder into Claude Code's source of truth so any agent you spin up reproduces these exact concepts.

## 1. Repo layout (monorepo)
```
forleads/
├─ CLAUDE.md                      # the constitution (§3 below)
├─ docs/                          # ← copy this entire handoff folder in
├─ package.json  pnpm-workspace.yaml  turbo.json
├─ .env.example
├─ apps/
│  ├─ web/                        # Expo web (or Next) — desktop rails
│  └─ mobile/                     # Expo — iOS/Android, bottom sheet
├─ packages/
│  ├─ core/                       # state machine, agent client, types, i18n
│  ├─ design/                     # tokens from doc 05 (single source of truth)
│  ├─ map/                        # <Map> adapter: GL JS (web) / MapLibre RN (native)
│  └─ agents/                     # Dispatcher, Scouts, Reducer, Composer, Linter
├─ supabase/
│  ├─ schema.sql                  # data model from doc 03 §5
│  └─ functions/                  # dispatch, scouts, reduce, notes, draft, send, geocode, imagery
└─ infra/
   └─ vm/                         # Ollama (bge-m3), Nominatim/Photon, classifier
```

## 2. Tech pins
- pnpm + Turborepo · TypeScript everywhere · Expo SDK (latest) + Expo Router + React Native Web
- `maplibre-gl` (web) · `@maplibre/maplibre-react-native` v11 (native) · `pmtiles`
- `@supabase/supabase-js` · pgvector · PostGIS · `h3-js`
- Agent brain: Claude (Agent SDK). Vision/bulk: Gemini Flash + Groq. Embeddings: BGE-M3 via Ollama.

## 3. `CLAUDE.md` (drop this at repo root — verbatim)
```md
# Forleads — Engineering Constitution

You are building Forleads: a living-map agentic CRM for real-estate agents.
The docs/ folder is the SOURCE OF TRUTH. Read docs/Forleads_Vision_v1.md,
_Architecture_, _AgentLoops_, _DesignSystem_, _MapGIS_, and _Screens_ before coding.

## Non-negotiable principles (from doc 02)
1. The MAP is the home screen. Spatial-first, list-second.
2. NO NAKED NUMBERS. Every value rendered must carry {source[], confidence A–D}.
   A scout MUST NOT return a value without a source; if it can't ground a claim it
   returns confidence 'D', value null, and an honest gap.
3. The NOTE is a trigger: note → situation → next-best-action → DRAFT in a Review Tray.
4. HUMAN-IN-THE-LOOP gate: nothing sends without an explicit human Approve (MVP).
5. BOUNDED SWARM: Dispatcher → parallel budgeted Scouts → Reducer. Max ONE break-out,
   never recursive. Hard budgets (time/tokens/calls) + per-scout source allowlists.
6. DEGRADE GRACEFULLY, GLOBALLY. OSM is the free floor; richer data is a pluggable
   PropertyDataProvider per market. Never fake richness in thin regions.
7. COMPLIANCE built-in: a fail-closed fair-housing linter screens every generated message.
8. ONE CORE, TWO SHELLS. Shared packages/*; the <Map> adapter is the only platform fork.
9. Design tokens live ONLY in packages/design (doc 05). Never hardcode colors.
10. Cache-first by H3 to respect free-tier limits and keep cost ≈ $0.

## The motion rule
The cinematic fly-to IS the scout loading window. The aqua "thinking" beacon animates
ONLY while real scouts run. Never fake discovery. Respect prefers-reduced-motion.

## Definition of done for any feature
- Types enforce the EvidenceCard contract (doc 04 §2).
- Works on web AND mobile (or is explicitly behind the <Map> adapter).
- Has an honest empty/low-data state.
- Generated outreach passes the compliance linter before it can be approved.
- No secret keys client-side; external calls go through edge proxies.
```

## 4. Subagent definitions (`.claude/agents/` — create these)
Each maps to a doc. Use them so work stays consistent.

```md
---
name: map-engineer
description: Builds the <Map> adapter, fly-to, layers, beacons. Owns docs 07.
tools: Read, Edit, Write, Bash, Grep, Glob
---
Implement the living map per docs/Forleads_MapGIS_v1.md and tokens in packages/design.
One style.json for GL JS + MapLibre RN. The fly-to is the scout loading window. Always
render the attribution bar. Cache geocode/imagery by H3.
```
```md
---
name: agent-orchestrator
description: Builds Dispatcher/Scouts/Reducer/Composer/Linter. Owns doc 04.
tools: Read, Edit, Write, Bash, Grep, Glob
---
Implement the bounded swarm per docs/Forleads_AgentLoops_v1.md. Enforce the EvidenceCard
contract at the type boundary. Budgets + allowlists + ONE break-out. Composer output is a
DRAFT; the linter is fail-closed; nothing auto-sends.
```
```md
---
name: design-system-keeper
description: Owns packages/design + component fidelity to docs 05 & 08.
tools: Read, Edit, Write, Grep, Glob
---
Tokens are the only source of truth for color/type/motion. Build Evidence Card, Grade Chip,
Scout Beacon, Review Tray, Bottom Sheet exactly per doc 05. Enforce reduced-motion + AA contrast.
```
```md
---
name: data-grounding-engineer
description: PropertyDataProvider adapters + grounding/grading + RAG memory. Owns doc 03 §5 + doc 01 §D.
tools: Read, Edit, Write, Bash, Grep, Glob
---
Implement OSMProvider (global free floor) + the adapter interface for paid per-market sources
(user brings key). Grade A–D. BGE-M3 embeddings → pgvector. Never resell data; never present an
estimate as a fact.
```

## 5. Bootstrap prompt (paste into Claude Code first)
```
Read every file in docs/ — especially Forleads_Vision, _Architecture, _AgentLoops,
_DesignSystem, _MapGIS, _Screens, and _BuildPlan_Friday. Treat docs/ as the source of truth.

Then scaffold the monorepo exactly as in docs/Forleads_ClaudeCodeHandoff_v1.md §1:
- pnpm + Turborepo workspaces
- apps/web (Expo web) + apps/mobile (Expo) sharing packages/{core,design,map,agents}
- packages/design with the CSS-variable tokens from doc 05 (verbatim values)
- packages/map with a <Map> adapter (MapLibre GL JS on web, @maplibre/maplibre-react-native on native) consuming ONE Protomaps ink style.json
- supabase/schema.sql with the data model from doc 03 §5 (PostGIS + pgvector + RLS)
- supabase/functions stubs: dispatch, scouts, reduce, notes, draft, send, geocode, imagery
- root CLAUDE.md verbatim from doc 10 §3
- .claude/agents/* from doc 10 §4
- .env.example with every key in doc 09 §1

Do NOT implement features yet. Produce the skeleton + a running `pnpm dev` web shell with an
empty MapLibre map and a ⌘K address search. Then stop and show me the tree.
```

## 6. Feature prompts (run in this order — mirrors the Friday plan)
1. **Map:** "As `map-engineer`, implement the cinematic fly-to + layers + attribution per doc 07. Acceptance: any global address flies in at 60fps with pin+footprint."
2. **Swarm:** "As `agent-orchestrator`, implement `/dispatch` + Property/Imagery/Risk scouts + `/reduce` per doc 04, streaming EvidenceCards. Enforce the contract in types. Acceptance: tap a house → graded, cited cards stream."
3. **Note→Action:** "Implement `/notes` situation classifier + `/draft` Composer + fail-closed compliance linter + Review Tray per docs 04 §6 and 08 S4. Acceptance: UC-1 end to end."
4. **Mobile+persist:** "Bring up apps/mobile sharing packages/core; swap `<Map>` to MapLibre RN; add Supabase auth+RLS+persistence. Acceptance: same loop on a phone, data persists."
5. **Ship:** "Wire Vercel (web) + EAS (TestFlight/Android internal). Add the Supabase cron ping. Seed the demo metro."

## 7. Guardrails for the agents (paste when relevant)
- "Before returning any number to the UI, confirm it carries `{sources[], confidence}`. If you can't, return grade D with an honest gap."
- "Never auto-send. Composer output is always a draft pending human Approve."
- "Never hardcode a color — import from packages/design."
- "Respect free-tier limits: cache by H3, isolate the Gemini billing-free project, self-host or rate-limit Nominatim/Mapillary."
- "Run the compliance linter on every generated message; it is fail-closed."

## 8. What to verify before calling it done
Map flies globally · scouts stream graded+cited cards · note→draft→approve works (UC-1) · runs web+mobile · honest empty states · linter blocks protected-class copy · no client-side secrets · cost ≈ $0. Cross-check against `Forleads_BuildPlan_Friday_v1.md` acceptance tests.
