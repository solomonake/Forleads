# 09 · Forleads — Solo-Founder $0 Build Plan to Friday (v1)

> You're solo, in college, budget = your Claude + Codex subs. This is the **literal** plan to have **web live + mobile on an install link by Friday (June 26, 2026)**. It ships a razor-sharp vertical slice of the magic loop — not the whole CRM. That's the right call; depth comes after.

## 0. Honest scope for Friday (read first)
**In:** map → cinematic fly-to → 3 live scouts streaming grounded evidence cards → note → drafted email in a Review Tray → approve (mock-send) — running on **one demo metro**, on **web (public URL)** and **mobile (TestFlight + Android internal/APK)**.
**Out (post-Friday):** full auth/billing, all 5 scouts, overlay CRM sync, watchers, public App Store/Play listings (those need review — days to weeks).
**Why:** one perfect loop that makes people gasp beats ten half-features. The slice proves every core concept.

## 1. Accounts to create today (all free, ~30 min)
- **Supabase** (Postgres + pgvector + auth) · **Vercel** (web deploy) · **Expo/EAS** (mobile) · **Mapillary** dev token · **Esri** basemap/imagery key (free tier) or skip with MapTiler free · **Google AI Studio** (Gemini free key, separate project, no billing) · **Groq** key · **Oracle Cloud Always-Free** *or* run **Ollama locally** for embeddings + a small Nominatim/Photon. Keep **Claude** key handy for the agent brain.

## 2. The stack you'll scaffold (matches doc 03)
Monorepo (pnpm + Turborepo): `apps/web` (Expo web/Next), `apps/mobile` (Expo), `packages/core` (state, agent client, design tokens), `packages/map` (the `<Map>` adapter), `supabase/` (schema + edge functions). See `Forleads_ClaudeCodeHandoff_v1.md` for the exact tree and the bootstrap prompt.

---

## DAY-BY-DAY

### ☀️ SUNDAY (today) — Foundations
- Create the accounts above; put keys in `.env` (and Supabase/Vercel/EAS secrets).
- In Claude Code: paste the **bootstrap prompt** (doc 10). It scaffolds the monorepo, design tokens (from doc 05), and the Supabase schema (doc 03).
- Stand up the **hybrid VM** (or local): `ollama pull bge-m3`; optional Nominatim/Photon (or use public Nominatim for now, cache hard).
- **Done when:** `pnpm dev` runs the web shell with an empty MapLibre map and a working ⌘K search box.

### 🗺️ MONDAY — The living map
- `<Map>` adapter (MapLibre GL JS) + Protomaps PMTiles ink style (tokens from doc 05).
- Photon/Nominatim geocode behind `/geocode` proxy (+ H3 cache).
- **Cinematic fly-to** (doc 07 §1): zoom+pitch ease, arrival pulse, active footprint highlight, attribution bar.
- **Acceptance:** type an address anywhere on Earth → it flies there at 60fps → pin + footprint + attribution. (UC verifies the "global" promise.)

### 🤖 TUESDAY — The swarm
- `/dispatch` (Claude) + **3 scouts**: Property (OSM), Imagery (Mapillary + Esri + Gemini vision caption), Risk (OSM/flood). Each with the **EvidenceCard contract** + budgets (doc 04 §2).
- Stream cards over WebSocket → **Scout Feed** with staggered reveal + grade chips + scout beacon (doc 05).
- `/reduce` merges + grades + one break-out rule.
- **Acceptance:** tap a house → beacon breathes → 3+ cited, graded cards stream in during/after the flight → overall grade shown. No naked numbers anywhere.

### ✉️ WEDNESDAY — Note → action → review
- Note composer (text + voice-to-text) → `/notes` situation classifier (doc 04 §6).
- `/draft` Composer (brand voice + evidence) → **Compliance linter** (fail-closed) → **Review Tray** card (doc 08 S4).
- `/send` mock (writes `action.status='sent'`, logs to memory) — real email provider is post-Friday.
- **Acceptance (the demo):** "knocked, no answer" → drafted, compliant, on-brand email appears in the tray with sender+recipient+evidence → Approve → "sent" + logged. **This is UC-1 end to end.**

### 📱 THURSDAY — Mobile + persistence + polish
- Bring up `apps/mobile` (Expo) sharing `packages/core`; swap `<Map>` to MapLibre React Native; bottom-sheet layout (doc 08).
- Supabase auth (magic link) + RLS; persist lead_surface/notes/actions/memory.
- Polish motion, reduced-motion path, empty/low-data states (graceful degradation), accessibility pass.
- **Acceptance:** same loop runs on a physical phone via **Expo Go / dev build**; data persists across reload.

### 🚀 FRIDAY — Ship
- **Web:** `vercel --prod` → public URL. Add a cron ping so Supabase doesn't pause.
- **Mobile:** `eas build` (iOS → **TestFlight**, Android → **internal track / APK**). Send the install links.
- Seed the **demo metro** with 5–10 pre-warmed leads so first impression is instant.
- Record a 60-sec screen capture of the loop (your launch asset).
- **Done when:** a stranger opens the web URL, searches their own street anywhere in the world, sees it fly + scouts ground real cards, writes a note, and gets a draft they'd actually send.

---

## Acceptance tests = the user cases
Friday must pass **UC-1** (knocked→draft), **UC-7** (vision caption), and the map/global promise. UC-2/4/6/8–12 are the post-Friday backlog (Month 1–3 in doc 00).

## Risk register (and the move)
| Risk | Move |
|---|---|
| App Store review won't clear by Fri | Ship TestFlight + Android internal; public listing later. Set expectations now. |
| Nominatim/Mapillary rate limits during demo | Self-host or cache hard by H3; pre-warm demo metro. |
| Supabase free pause / 500MB cap | Cron ping; keep MVP data small; upgrade only at traction. |
| Gemini free project gets billing-flagged | Isolate a billing-free project + key. |
| Scope creep kills Friday | The "Out" list in §0 is load-bearing. Protect the single loop. |
| Vision/comps look wrong in a thin region | Graceful degradation + grade-D honesty is a *feature*; demo it. |

## After Friday (the compounding part)
Month 1: real send, 2 more scouts, overlay import (1 CRM), watchers. Month 3: territory farming from GPS, listing/ad generation, market data adapters, public mobile launch. Spatial RAG memory makes week-12 dramatically smarter than week-1 — that's the retention engine.
