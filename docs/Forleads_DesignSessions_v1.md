# 02 · Forleads — Expert Design Sessions (v1)

> A simulated war-room of senior practitioners. Personas are composites of FAANG-grade roles, used to pressure-test decisions from every angle. Read this to understand *why* the product is shaped the way it is — every later doc inherits these decisions.

## The panel
- **Maya** — Principal Product Designer (ex-Maps/Search). Owns the "magical agentic feel" and the bar for craft.
- **Dev** — Distinguished Systems Engineer. Owns latency, cost ($0), and the agent orchestration's correctness.
- **Lena** — Staff GIS Engineer. Owns map truth, projections, tiles, and "does this actually work globally."
- **Marcus** — Top-producing real-estate agent, 14 yrs, 200+ deals/yr team. Owns "would I actually use this at a door."
- **Priya** — Growth/PLG lead. Owns activation, the two front doors, retention.
- **Sam** — Trust & Safety / Counsel. Owns fair housing, privacy, "what gets the agent sued."

---

## Session 1 — What is the home screen?
**Maya:** Every CRM opens to a list. Lists are where leads go to die. Our home is the **map**. The first emotional beat must be *"this place is alive."*

**Marcus:** Agreed, but I work from my car. If the map needs ten taps before it's useful, I'll never open it. I want: type address → it takes me there → it already did the homework. At a door I have maybe 20 seconds.

**Lena:** A map-first home is fine, but "alive" can't mean fake. If we animate scouts "discovering" data that's really a 200ms cache hit, agents will smell it. The animation has to be *honest theater* — it reflects real work happening.

**Dev:** I can make that real. The fly-to (≈1.8s) is exactly the window where I dispatch scouts. The animation *is* the loading state. By the time the camera lands, fast scouts (OSM, geocode) are back; slow ones (vision, comps) stream in as cards. Honest and magical.

> **Decision 1.1** — Home screen is a full-bleed map. The cinematic fly-to *is* the scout loading state. No fake delays; the motion maps to real dispatch.
>
> **Decision 1.2** — "20-second door test" becomes a hard design constraint: from cold open to a usable lead summary ≤ 3 taps and ≤ 3 seconds on mobile.

---

## Session 2 — The trust problem (the one that kills proptech AI)
**Marcus:** The fastest way to lose me: show a client a Forleads number, client's neighbor just sold, the number's wrong, I look like a fool. Never happens twice.

**Sam:** And if the "AVM" leans on anything correlated with protected class, that's a fair-housing problem. Automated valuation + targeting is a legal minefield.

**Maya:** So we don't sell certainty. We sell *defensible*. Every card cites a source and wears a confidence grade. A grade-A fact (a recorded sale) looks different from a grade-C estimate (heuristic). The agent can *see* the difference at a glance.

**Dev:** I'll enforce it at the type level: a scout literally cannot return a number without a `source` and a `confidence`. "No fabrication" is a contract, not a guideline. If a scout can't ground it, it returns `insufficient_evidence` and we say so.

> **Decision 2.1** — **Evidence cards** are the atomic UI unit. Schema: `{claim, value, source[], confidence(A–D), as_of_date}`. No naked numbers anywhere in the product.
>
> **Decision 2.2** — Confidence grade is visually unmissable (color + letter + "why this grade" on tap).
>
> **Decision 2.3** — A **compliance linter** screens every generated outreach message and blocks any targeting/inference by protected class. Ships in MVP, not "later."

---

## Session 3 — Agents: one big brain or a swarm?
**Dev:** One monolithic prompt that "does everything" will be slow, expensive, and unpredictable. The orchestrator–worker pattern wins: a **Dispatcher** decomposes intent and fans out to **Scouts**, each with a tiny job, a budget, and an allowlist of sources. A **Reducer** merges. Parallel = fast; bounded = cheap; typed = safe.

**Maya:** And it gives me a UI: each scout is a card that streams in. The swarm *is* the feel.

**Lena:** Give each scout a single source domain so I can reason about correctness. Property Scout touches OSM/records only. Don't let one agent freelance across everything.

**Sam:** People Scout is the risky one. Hard-constrain it to lawful public/consented data, no demographic inference, ever.

> **Decision 3.1** — Architecture is **Dispatcher → parallel Scouts (budgeted, allowlisted) → Reducer**. Five MVP scouts: Property, Imagery, People, Market, Risk.
>
> **Decision 3.2** — Each scout = single responsibility + single source domain + a "no fabrication / insufficient_evidence" contract + a hard budget (time, tokens, calls).
>
> **Decision 3.3** — **Break-out rule:** if the Reducer sees low confidence or a conflict, it may spawn *one* deeper scout or surface *one* crisp question to the human — never an infinite loop. (Full rules in doc 04.)

---

## Session 4 — Notes → action (the workflow unlock)
**Marcus:** Here's the magic I actually want. I knock, no one's home. I say into my phone, "nobody home, nice yard, kid's bike out front." That should *become* something — a warm letter in my drafts, ready to send, that sounds like me.

**Priya:** That's the activation moment. The first time a messy note turns into a polished, on-brand draft they'd actually send — that's when they're hooked. Protect that moment above all.

**Maya:** So a note is an input event. The agent classifies the *situation* (no-contact / interested-seller / objection / buyer-criteria / dead) and proposes the **next best action** as a *drafted artifact in review state* — never auto-sent.

**Sam:** Review state is also our safety gate. Human approves → it sends. The linter runs before it ever reaches the tray.

> **Decision 4.1** — Notes (typed or voice) are first-class events. Pipeline: `note → situation classification → next-best-action → drafted artifact (email/SMS/task/calendar) → Review Tray → human approve → send → log`.
>
> **Decision 4.2** — Drafts carry full context: sender identity + signature, recipient, subject, body in the agent's brand voice, and the *evidence* it used (so the agent can defend the draft).
>
> **Decision 4.3** — Nothing sends without a human tap in MVP.

---

## Session 5 — Global from day one (the hard mode)
**Lena:** "Global" is a promise we'll break in rural Indonesia if we're not careful. Data density varies by 100x. The product must *degrade* beautifully: when there's no street imagery, show aerial; when there's no comp, say "insufficient." Never show a broken tile or a fake fact.

**Dev:** The provider-adapter pattern handles it. OSMProvider is the global floor — always on, free. Richer providers slot in per market behind the agent's own key. The agent's behavior doesn't change; only the evidence quality does, and we grade it.

**Priya:** And multilingual matters — BGE-M3 covers 100+ languages, so notes and search work in the agent's language. That's a real "global" feature, not a flag.

> **Decision 5.1** — **Graceful degradation** is a design principle: every panel has a defined empty/low-data state that stays honest and useful.
>
> **Decision 5.2** — **Provider-adapter** data layer; OSM is the global free floor; market providers are pluggable and key-per-agent.
>
> **Decision 5.3** — UI strings, notes, and semantic search are language-agnostic from day one (BGE-M3 + i18n scaffolding).

---

## Session 6 — One codebase, two platforms, by Friday
**Dev:** Expo + React Native Web = one component tree for web + iOS + Android. The only fork is the map: MapLibre **GL JS** on web, MapLibre **Native** on phone, behind a single `<Map>` adapter with one shared style JSON. Business logic, agent calls, design system: shared.

**Maya:** Good — I design the map style *once* and it's pixel-consistent everywhere.

**Marcus:** Just don't make me wait on an app-store review to try it. I want it on my phone Friday.

**Dev:** TestFlight + Android internal track Friday. Public listings after review. Web is live the moment we push.

> **Decision 6.1** — **Universal app**: Expo Router + React Native Web; shared core; `<Map>` adapter is the only platform fork.
>
> **Decision 6.2** — **Friday definition of done** = web live on Vercel + mobile on TestFlight/Android-internal, all running the same vertical slice. Public store = post-Friday.

---

## Session 7 — The two front doors
**Priya:** Pros won't re-enter their book of business. That's the #1 churn-at-signup killer. So we need an **overlay** mode: import their CRM read-only, enrich on the map, prove value before asking for anything. New agents get the **CRM-native** mode with an onboarding scout that builds a pipeline from contacts + a farm area.

**Marcus:** Overlay is the only way you get someone like me. I'm not leaving Follow Up Boss on a Tuesday. But if you make every one of my contacts smarter on a map? I'll run both.

> **Decision 7.1** — Ship **two modes** on one product: *CRM-native* (new agents) and *Overlay* (import + enrich, no migration). Overlay is the pro wedge.

---

## Converged principles (inherited by all later docs)
1. **Map is the workspace.** Spatial-first, list-second.
2. **The fly-to is the loading state.** Honest theater; motion maps to real work.
3. **No naked numbers.** Evidence cards, cited, graded. Trust is the product.
4. **The note is a trigger.** Observation → drafted next-best-action in a review tray.
5. **Human-in-the-loop gate.** Nothing sends itself (MVP).
6. **Bounded swarm.** Dispatcher → budgeted scouts → reducer; one break-out, never a loop.
7. **Degrade gracefully, globally.** Honest empty states; OSM floor; pluggable depth.
8. **Compliance is built-in.** Fair-housing linter + privacy minimalism from day one.
9. **One codebase.** Universal app; map adapter is the only fork.
10. **Two front doors, no lock-in.** Overlay for pros, CRM-native for new agents; export always.
