# 03 · Forleads — System Architecture (v1)

## 1. Principles
- **Thin client, smart edge, bounded agents.** The app renders and captures; agent work runs in edge/server functions with hard budgets; data is grounded and cached.
- **One core, two shells.** Shared TypeScript core (state, API, agent calls, design system). Web shell (Next.js/Expo-web) and native shell (Expo) differ only in the `<Map>` adapter.
- **Everything cited.** No value reaches the UI without `source` + `confidence`.

## 2. High-level diagram
```
┌──────────────────────────── CLIENTS (one core) ────────────────────────────┐
│  Web (MapLibre GL JS)        Mobile iOS/Android (MapLibre React Native)      │
│  └── <Map> adapter ─────────────────┴──── shared style.json (Protomaps CC0) │
│  Shared: app state · design system · agent client · auth · i18n             │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │ HTTPS / WebSocket (stream scout cards)
┌───────────────▼──────────── EDGE / API (Supabase Edge Fns + Node) ──────────┐
│  /dispatch     → Dispatcher agent (Claude)                                   │
│  /scouts/*     → Scout workers (parallel, budgeted)                          │
│  /reduce       → Reducer (merge, de-dup, grade)                              │
│  /notes        → note → situation → next-best-action                          │
│  /draft        → compose artifact (brand voice) → compliance linter           │
│  /send         → human-approved dispatch to Email/SMS providers              │
│  /geocode      → self-hosted Nominatim/Photon proxy (+cache)                  │
│  /imagery      → Mapillary + Esri proxy (+cache, +attribution)               │
└───────────────┬───────────────────────┬──────────────────────┬──────────────┘
                │                        │                      │
     ┌──────────▼─────────┐   ┌──────────▼─────────┐  ┌─────────▼──────────┐
     │  Supabase Postgres │   │  Hybrid VM         │  │  External (per key) │
     │  + pgvector (RAG)  │   │  Ollama BGE-M3     │  │  Mapillary, Esri,   │
     │  + RLS + Storage   │   │  Nominatim/Photon  │  │  Gemini, Groq,      │
     │  + Realtime        │   │  cheap classifier  │  │  MLS/ATTOM adapters │
     └────────────────────┘   └────────────────────┘  └─────────────────────┘
```

## 3. The hybrid VM (your compute question, answered)
- **You do NOT need a GPU cluster or fine-tuning for the MVP.** The "hybrid" compute is small and cheap:
  - **Free always-on VM** (e.g., Oracle Cloud Always-Free ARM Ampere — 4 vCPU/24 GB, or Google Cloud e2-micro free) runs: **Ollama (BGE-M3 embeddings)**, **Nominatim + Photon** (self-hosted geocoding), and a tiny **classifier** service.
  - **Frontier reasoning** (Dispatcher, drafting, compliance) is API calls to **Claude**; **vision + bulk** to **Gemini Flash free** / **Groq**. No model weights to host for those.
- **If you ever fine-tune** (e.g., a property-condition photo scorer), do it in a **free Kaggle/Colab GPU notebook**, export a small model, serve it on the same VM. Still $0. This is a Month-3+ "maybe," not a Friday need.

## 4. Component responsibilities
| Component | Responsibility | Tech |
|---|---|---|
| `<Map>` adapter | Render basemap + layers + scout beacons; emit tap/idle events | MapLibre GL JS / RN |
| App core | State machine for the loop, optimistic UI, streaming card intake | TS, Zustand/Redux, RN Web |
| Dispatcher | Decompose intent → plan scouts → set budgets | Claude (Agent SDK) |
| Scouts | Single-source evidence gathering under budget | Claude/Gemini/Groq + provider adapters |
| Reducer | Merge, de-dup, grade, detect conflict, decide break-out | Deterministic code + Claude for judgment calls |
| Notes engine | Classify situation → choose next-best-action | Claude + few-shot |
| Composer | Draft artifact in brand voice with evidence | Claude |
| Compliance linter | Block protected-class targeting/inference; flag claims | Rules + Claude check |
| Memory/RAG | Embed + store notes/leads/outcomes; retrieve context | BGE-M3 + pgvector |
| Geocode/Imagery proxies | Cache + rate-limit + attribute external sources | Node edge fns |

## 5. Data model (Postgres, simplified)
```sql
-- People & identity
agent(id, name, email, brand_voice_json, signature_html, locale, mode)         -- mode: 'crm'|'overlay'
crm_connection(id, agent_id, provider, mode, credentials_ref, last_sync_at)     -- overlay imports

-- The spatial unit
lead_surface(id, agent_id, geom geography(Point), address, h3_index,            -- one row per worked address
             status, label, first_seen_at, last_worked_at)
-- status: new|researching|contacted|nurturing|appointment|won|dead

-- Grounded evidence (never a naked number)
evidence_card(id, lead_surface_id, scout, claim, value_json,
              source_json,              -- [{name,url,as_of}]
              confidence,               -- 'A'|'B'|'C'|'D'
              created_at)

-- Observations & actions
note(id, lead_surface_id, agent_id, body, modality, situation, created_at)      -- modality: text|voice
action(id, lead_surface_id, type, status, payload_json, evidence_used jsonb,    -- type: email|sms|task|calendar
       created_at, approved_at, sent_at)                                        -- status: drafted|approved|sent|cancelled

-- Standing agents (buyer watchers, farming)
watcher(id, agent_id, criteria_json, area_geom, last_run_at, active)

-- Memory
memory_chunk(id, agent_id, lead_surface_id, content, embedding vector(1024),    -- BGE-M3 dim
             kind, created_at)
```
- **PostGIS** for spatial queries; **H3** index for fast territory aggregation; **RLS** so an agent only ever sees their own rows.

## 6. Key sequence — the magic loop
```
User taps address
  → client: geocode (cached) → camera.flyTo(target, 1.8s ease)   [animation = loading]
  → POST /dispatch {lead_surface}            (Dispatcher plans scouts + budgets)
  → fan-out POST /scouts/{property,imagery,people,market,risk}   (parallel, each ≤ budget)
  → each scout streams EvidenceCard(s) over WebSocket as they finish
  → client renders cards in staggered reveal; map drops pins/footprint
  → POST /reduce when scouts settle/timeout → merged, graded summary
       └─ if low-confidence/conflict → ONE break-out scout OR ONE user question
User adds note "knocked, no answer"
  → POST /notes → situation='no_contact' → next_best_action='warm_followup_email'
  → POST /draft → Composer writes email (brand voice + evidence) → linter passes
  → action(status='drafted') appears in Review Tray
User taps Approve
  → POST /send → email provider → action(status='sent') → embed outcome to memory
```

## 7. APIs (surface)
- `POST /dispatch` → `{plan, scout_jobs[]}`
- `POST /scouts/:type` → streams `EvidenceCard`
- `POST /reduce` → `{summary, grade, breakout?}`
- `POST /notes` → `{situation, suggested_actions[]}`
- `POST /draft` → `{action_draft, compliance: {pass, flags[]}}`
- `POST /send` → `{status}` (requires `approved_at`)
- `GET /lead/:id` → full lead surface + cards + notes + actions
- `POST /watchers` / `GET /watchers/:id/hits`

## 8. Performance & cost budgets
- Fly-to: 1.6–2.0 s (perceived-instant arrival). Fast scouts (geocode/OSM) target < 1.5 s; slow scouts stream up to a 6 s soft cap then "still looking…".
- Per-lead agent spend cap (token budget) enforced by Dispatcher; default free-tier = N scouts/day.
- Aggressive caching: geocode, imagery, and OSM responses cached by `h3_index` to respect Nominatim/Mapillary limits and cut cost to ~$0.

## 9. Security & privacy
- Supabase **RLS** on every table; agent-scoped.
- Secrets (provider keys) in vault, never client-side; external calls via edge proxies.
- PII minimization: store what's needed to act; **no demographic attributes**; honor delete/export.
- All outbound artifacts pass the **compliance linter** before they can be approved.

## 10. Known free-tier caveats to engineer around
- Supabase pauses after 7 days idle → cron ping during launch; plan paid upgrade at scale.
- Nominatim/Mapillary limits → self-host + cache by H3.
- Gemini free project must stay billing-free → isolate keys/projects.
See `Forleads_AgentLoops_v1.md` for the agent internals and `Forleads_BuildPlan_Friday_v1.md` for provisioning order.
