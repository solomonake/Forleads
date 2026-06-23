# 01 · Forleads — Grounded Research (v1)

> Every recommendation below is sourced. **Free-tier numbers drift — re-verify at build time.** Captured June 2026.

## A. Maps & rendering (the spine)

### MapLibre — one renderer, all platforms
- **MapLibre GL JS**: open-source, GPU-accelerated vector-tile maps in the browser. The web renderer.
- **MapLibre React Native v11**: wraps MapLibre Native for iOS + Android, works in Expo, APIs mirror GL JS. Same map style JSON renders on web *and* native — so we design the map **once**.
- **Decision:** MapLibre is the non-negotiable spine. It is the single biggest reason "web + native, one design" is feasible by Friday.

### Basemap — Protomaps / PMTiles
- Protomaps generates MapLibre styles from OSM; **visual design is CC0**. Whole-planet basemap can live in a single **PMTiles** file read directly by MapLibre in the browser (or self-hosted on cheap object storage), no tile server to run.
- **Decision:** Protomaps basemap, self-hosted PMTiles. $0, no per-tile billing, no vendor key in the hot path.

## B. Imagery (the "show me the house" requirement)

### Street-level — Mapillary
- **2B+ geotagged images across 190+ countries**; free API; faces/plates auto-blurred. License **CC-BY-SA 4.0** → *we must display attribution*. Recent API adds (2026): image radius search, quality scores.
- Coverage is community-driven, so it's uneven — dense in cities, sparse in rural areas. The product must **degrade gracefully** when imagery is missing (show aerial + "no street imagery here yet").
- **Decision:** Mapillary is the global street-imagery layer. This is what makes "high-res images of the address" answerable worldwide for free.

### Aerial / satellite — Esri World Imagery
- Esri World Imagery: **~1 m or better** in many regions, lower-res (15 m TerraColor, 2.5 m SPOT) worldwide; usable as a tile layer with attribution.
- Alt: **MapTiler satellite** (free dev tier) for self-hosted/offline.
- **Decision:** Esri World Imagery as the aerial layer (attribution required); MapTiler as fallback.

## C. Geocoding (address → point, point → address)
- **Nominatim** (OSM): global geo + reverse-geo. **Public API hard limit: 1 request/second**, must cache, must set User-Agent, *not for production multi-user load*.
- **Self-hosting** Nominatim and/or **Photon** (search-as-you-type, typo-tolerant) removes the limit — run on our VM.
- Coverage varies by region (strong in W. Europe; thinner in some developing markets) — a "global" caveat to surface in the UI.
- **Decision:** Self-host Nominatim (reverse + structured) **+** Photon (autocomplete) on the hybrid VM. Public Nominatim only for the prototype.

## D. Property / price data (the honest gap)
- **There is no free, global property + price dataset.** Confirmed across the landscape:
  - US-centric: RentCast (**50 free calls/mo**, 140M+ records), ATTOM (~160M US properties), ReportAll / Regrid (160M+ US/Canada parcels). All paid past trial; US/Canada only.
  - Global open: **OpenStreetMap building footprints + land-use + some parcel data**, quality varies wildly by country.
- **Design consequence (this is the wedge, not a weakness):**
  - **Provider-adapter pattern**: a `PropertyDataProvider` interface with implementations `OSMProvider` (global, free, always on), `RentCastProvider`, `ATTOMProvider`, `MLSProvider` (per-market, user brings key).
  - The Market Scout returns a **confidence grade** (A: official record / recent comp; B: modeled from 3+ signals; C: sparse/heuristic; D: insufficient — *we say so*).
- **Decision:** Ship OSMProvider for the global free tier; adapters for paid US sources behind the agent's own key. Never resell data; never present an estimate as a fact.

## E. AI models (the hybrid brain)
| Role | Model | Free-tier reality (June 2026) | Use |
|---|---|---|---|
| Orchestrator / high-stakes reasoning | **Claude (Agent SDK)** | Your subscription / API | Dispatcher, note→action, compliance, composing outreach |
| High-volume + multimodal | **Gemini 2.5 Flash** | **1,500 req/day, 1M TPM, 15 RPM**, no card | House-photo understanding (vision), bulk classification, summaries |
| Ultra-fast cheap inference | **Groq** (Llama 3.3 70B etc.) | ~30 RPM, ~1K req/day per model, no card | Snappy autocompletes, quick tags |
| Embeddings (RAG) | **BGE-M3** via Ollama | $0 local, MIT, **100+ languages**, 8K ctx | Spatial memory, semantic note/lead search — multilingual = global |
| Vector store | **pgvector** in Supabase | Included on free tier | Store + query embeddings |

- **Fine-tuning / GPUs: not needed for MVP.** RAG + tool-use + good prompts beat a fine-tune here and cost $0. Revisit only if a narrow, high-volume task (e.g., property-photo condition scoring) proves worth a small fine-tune later — and even then a free Kaggle/Colab GPU session suffices; **no rented VM cluster required.**
- Note: enabling billing on a Gemini project removes its free tier — keep a separate project for free inference. Gemini 2.5 **Pro** left the free tier in April 2026; use **Flash**.

## F. Backend, auth, deploy ($0)
- **Supabase free**: 500 MB Postgres, **pgvector included**, 1 GB storage (50 MB/file), 50K MAU auth, Row-Level Security, Realtime (200 concurrent). Caveats: **pauses after 7 days inactivity**, 2-project limit, no auto-backups. Fine for MVP; cron-ping to avoid pausing during demo week.
- **Web deploy: Vercel** (or Netlify) free — instant, global CDN.
- **Mobile deploy: Expo + EAS** free tier → **TestFlight (iOS) + Android internal track** are reachable by Friday. **Public App Store / Play listing requires review (days-to-weeks)** — plan accordingly.
- **Universal codebase**: Expo Router + **React Native Web** lets the same RN components target web + iOS + Android; the heavy native bits (MapLibre Native) are isolated behind a `Map` adapter so web uses GL JS.

## G. Agent orchestration pattern
- **Orchestrator–worker (dispatcher–scout)**: a lead agent decomposes intent and spawns parallel sub-agents with **bounded budgets** (time, tokens, allowed sources), then a **reducer** merges typed results. This is the documented multi-agent pattern and maps 1:1 onto our scouts. See `Forleads_AgentLoops_v1.md` for the full spec, break-out rules, and guardrails.

## H. Compliance & legal (must-haves, not optional)
- **Fair housing (US) / equivalent anti-discrimination law**: generated outreach and lead targeting must never use or infer protected classes. Build a **compliance linter** that screens every generated message and blocks targeting by protected attributes. This is both ethics and license-protection for the agent.
- **Imagery attribution**: Mapillary (CC-BY-SA) and Esri require visible attribution.
- **Privacy**: People Scout uses only lawful public-record/consented data; store minimal PII; honor deletion. Do not persist demographic data.
- **Map data**: OSM/Nominatim require attribution + caching compliance.

---

## Sources
- [Protomaps — the open map in a file](https://protomaps.com/api) · [Protomaps basemaps for MapLibre](https://docs.protomaps.com/basemaps/maplibre) · [Protomaps/basemaps (GitHub)](https://github.com/protomaps/basemaps)
- [MapLibre GL JS](https://maplibre.org/projects/gl-js/) · [maplibre-gl-js (GitHub)](https://github.com/maplibre/maplibre-gl-js) · [Self-hosted maps for (practically) free](https://dev.to/aaronblondeau/self-hosted-maps-for-practically-free-1i3n)
- [MapLibre React Native — Getting Started](https://maplibre.org/maplibre-react-native/docs/setup/getting-started/) · [maplibre-react-native (GitHub)](https://github.com/maplibre/maplibre-react-native) · [Expo setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/) · [npm](https://www.npmjs.com/package/@maplibre/maplibre-react-native)
- [Mapillary API docs](https://www.mapillary.com/developer/api-documentation) · [Mapillary open data](https://www.mapillary.com/open-data) · [Mapillary CC-BY-SA license](https://help.mapillary.com/hc/en-us/articles/115001770409-CC-BY-SA-license-for-open-data) · [Mapillary (Wikipedia)](https://en.wikipedia.org/wiki/Mapillary)
- [Esri World Imagery overview](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) · [Esri World Imagery in OSM](https://www.esri.com/arcgis-blog/products/constituent-engagement/constituent-engagement/esri-world-imagery-in-openstreetmap) · [MapTiler free satellite imagery](https://docs.maptiler.com/guides/self-hosting/map-server/free-satellite-imagery-on-premise/) · [Where to get free satellite imagery 2026](https://spacefromspace.com/blog/get-free-satellite-imagery-2026/)
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) · [Nominatim.org](https://nominatim.org/)
- [RentCast API](https://www.rentcast.io/api) · [Regrid parcels](https://regrid.com/) · [ATTOM property data API](https://www.attomdata.com/solutions/property-data-api/) · [ReportAll parcel API](https://reportallusa.com/products/api) · [OSM Parcel wiki](https://wiki.openstreetmap.org/wiki/Parcel)
- [Groq free-tier limits 2026 (TokenMix)](https://tokenmix.ai/blog/groq-free-tier-limits-2026) · [Groq rate limits (docs)](https://console.groq.com/docs/rate-limits)
- [Gemini API rate limits (Google)](https://ai.google.dev/gemini-api/docs/rate-limits) · [Gemini free-tier 2026 (TokenMix)](https://tokenmix.ai/blog/gemini-api-free-tier-limits) · [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [nomic-embed-text (Ollama)](https://ollama.com/library/nomic-embed-text) · [Best open-source embedding model for RAG (Tiger Data)](https://www.tigerdata.com/blog/finding-the-best-open-source-embedding-model-for-rag) · [Local RAG with Ollama + pgvector](https://dev.to/signal-weekly/build-a-local-rag-pipeline-with-ollama-pgvector-no-api-keys-no-cloud-1h8a)
- [Supabase pricing](https://supabase.com/pricing) · [Supabase free-tier limits 2026](https://www.itpathsolutions.com/supabase-free-tier-limits) · [Supabase Vector](https://supabase.com/modules/vector)
