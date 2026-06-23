# 00 · Forleads — Vision & Strategy (v1)

## 1. The problem, stated honestly
Real-estate agents live in a swivel-chair workflow: a map in one tab, a CRM in another, a county records site in a third, a valuation tool in a fourth, their email in a fifth, and a notepad on the dashboard of their car. The work that actually wins deals — *knowing which door to knock, what to say, and following up forever without dropping anyone* — happens in the cracks between these tools. Existing CRMs (Follow Up Boss, kvCORE, LionDesk) are databases with reminders bolted on. Existing map tools (Google Maps, county GIS) show you a place but do nothing for you. Existing "AI" features are autocomplete.

No tool treats **the map as the workspace** and **an address as a live lead** that an agent swarm actively works on your behalf.

## 2. The thesis
> **A map where every address is a lead, worked by a swarm of grounded AI scouts that turn observations into the next action — and never guess.**

Three convictions:

1. **Spatial is the right primary surface.** Agents think in territory, drive-bys, and doors. The map is not a feature; it is the home screen. Every other tool buries the map.
2. **Grounding is the moat.** The temptation in proptech AI is to spit out a confident price. That destroys trust the first time it's wrong in front of a client. Forleads inverts it: it shows *only what it can cite*, grades everything else, and is transparent about uncertainty. An agent can repeat a Forleads fact to a seller without fear.
3. **The unit of value is the next action, not the dashboard.** A note like "knocked, no answer" should not just be stored — it should *produce* a drafted follow-up sitting in a review tray. Forleads closes the loop from observation → action → outcome → memory.

## 3. Why now (the unlock)
- **Open global map infra matured.** MapLibre renders the same vector style on web, iOS, and Android. Protomaps puts a whole-planet basemap in a single CC0 file.
- **Global street imagery is open.** Mapillary has 2B+ images across 190+ countries under a permissive license — the first time "show me this house" is answerable worldwide for free.
- **Frontier agents can orchestrate.** The Claude Agent SDK makes the dispatcher→scout pattern a few hundred lines, not a research project.
- **Multilingual embeddings went free.** BGE-M3 covers 100+ languages locally at $0 — "global from day one" is finally tractable for RAG.

## 4. Positioning
**Forleads is to real-estate agents what a great chief-of-staff is to an executive:** it does the legwork, prepares the artifact, and waits for your "go." It is *not* a Zillow competitor (we don't own listings) and *not* another CRM skin (we work the lead, we don't just file it).

**Category:** Agentic spatial CRM / "lead surface" platform.

**Tagline options:**
- *"Every address is a lead. Every lead works itself."*
- *"The map that does the homework."*
- *"Grounded leads. Drafted follow-ups. Zero guessing."*

## 5. Two front doors (one product)
| New agent (no CRM) | Experienced agent (has a CRM) |
|---|---|
| Forleads **is** the CRM. Onboarding scout builds the pipeline from phone contacts + email + a chosen farm area. | Forleads is an **overlay**. Import (read-only or two-way) their CRM; the map enriches every record. No migration, no lock-in fear. |
| Hook: "Get your first 20 grounded leads in your farm in 10 minutes." | Hook: "Keep your CRM. We make every record in it smarter and every follow-up automatic." |

This dual-front-door is deliberate: the overlay path removes the #1 reason pros reject new tools ("I'm not re-entering 4 years of contacts").

## 6. What makes it novel (defensible, not gimmicks)
1. **Living-map fly-to + scout swarm** — the "magical agentic feel": you arrive and the place *comes alive* with streaming evidence cards. (UX moat — hard to copy well.)
2. **Grounded, citation-first evidence cards with confidence grades** — the trust moat.
3. **Note → Next-Best-Action drafting into a review tray** — the workflow moat: observation becomes a prepared artifact.
4. **Provider-adapter data layer** — global from day one; plug a richer data source per market without re-architecting.
5. **Fair-housing / compliance linter** on every generated message — a safety + liability moat that incumbents under-serve and that protects the agent's license.
6. **Spatial memory (RAG)** — every visit, note, and outcome feeds a per-agent knowledge base, so the product compounds: your 200th door is dramatically smarter than your first.

## 7. Anti-goals (what we will NOT do)
- We will not display an automated valuation as fact. Always graded, always cited.
- We will not auto-send anything. Human-in-the-loop gate on every outbound artifact (MVP).
- We will not scrape sources that prohibit it; the adapter layer is licensing-aware.
- We will not store protected demographic attributes or let the agent target by them (fair-housing).
- We will not lock data in; export is a first-class feature.

## 8. Success metrics (North Star + supporting)
- **North Star:** *Approved actions per active agent per week* (notes that became sent follow-ups). This captures the whole loop working.
- Supporting: time-to-first-grounded-lead (onboarding), scout evidence-card acceptance rate, % follow-ups that would have been missed, 4-week agent retention.

## 9. Business model (later, not MVP)
- Free: solo agent, capped scouts/day, public data only.
- Pro (~$29–49/mo): unlimited scouts, premium data adapters per market, CRM two-way sync, team territory.
- Data-adapter passthrough: when an agent connects a paid market data source (e.g., a US MLS or ATTOM), they bring their key; we never resell data.
- The wedge stays free and global; revenue rides on depth-per-market and team features.

## 10. The 12-month arc
- **Wk 1 (Friday):** vertical slice — map → fly-to → scouts → note → drafted email in review, on web + mobile internal track, one demo metro working end-to-end.
- **Month 1:** real auth, persistence, 3 scout types live, overlay import for one CRM, compliance linter.
- **Month 3:** buyer "Watcher" standing agents, territory farming from a GPS trail, social-ad/listing generation, 2–3 market data adapters.
- **Month 6:** team mode, mobile public store launch, spatial-memory compounding visible in retention.

See `Forleads_BuildPlan_Friday_v1.md` for the literal step-by-step, and `Forleads_UserCases_v1.md` for the 12 differentiated workflows.
