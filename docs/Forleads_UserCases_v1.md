# 06 · Forleads — User Cases (v1)

> 12 workflows. For each: the **trigger**, what **today's tools** do, the **Forleads way** (novel), and the **agent loop** behind it. These are the acceptance scenarios — if the build nails these, the product is real.

---

### UC-1 · Knocked, no answer → drafted follow-up (the canonical loop)
- **Trigger:** Agent at a door, no one home. Voice note: "nobody home, nice yard, kids' bikes out front."
- **Today:** Agent makes a mental note, maybe a CRM task, forgets, lead goes cold.
- **Forleads:** Note → situation `no_contact`. Composer drafts a warm, brand-voice letter referencing *grounded* details (the home, the neighborhood) — never the kids (compliance: familial status is protected). Lands in Review Tray with a retry task in 4 days. One tap sends.
- **Loop:** Notes engine → Composer → Compliance linter → Review Tray → Send → memory.

### UC-2 · Likely downsizer → empathetic, fitted outreach
- **Trigger:** Note: "older owner, said the house feels too big since the kids moved out."
- **Today:** Generic "thinking of selling?" mailer.
- **Forleads:** Situation `interested_seller` + intent `downsize`. Market Scout assembles single-story / smaller comps nearby (graded); Composer writes an empathetic letter about *options*, not pressure. Compliance ensures no age-based language. Includes a "what your home could enable" framing tied to **cited** comps only.
- **Loop:** Dispatcher → Market+Property scouts → Reducer (grade) → Composer → linter.

### UC-3 · Drive-by farming → ranked "likely-to-sell" street
- **Trigger:** Agent drives their farm; GPS trail captured (with consent).
- **Today:** Manual list, gut feel, door-to-door blind.
- **Forleads:** Ambient map scouts pre-warm parcels along the trail with *light public signals* (long tenure, recent land-use change, probate/− where lawfully public). Returns a **ranked street** of doors most worth knocking — each rank backed by cited signals, never by protected attributes.
- **Loop:** Ambient (cheap-only) scouts → H3 aggregation → ranked surfaces; tap promotes to full swarm. *(Sam's guardrail: signals are lawful public events only.)*

### UC-4 · Buyer with criteria → standing Watcher agent
- **Trigger:** "Buyer wants 3-bed, garden, under €X, this district."
- **Today:** Agent manually re-checks portals.
- **Forleads:** Creates a **Watcher** (standing agent) over an area + criteria. When a matching Lead Surface changes state (new listing signal, status change), it pings the agent with a ready-to-send "found one" message to the buyer.
- **Loop:** Watcher (scheduled) → match → draft → Review Tray.

### UC-5 · New agent, no CRM → CRM built in 10 minutes
- **Trigger:** Brand-new agent signs up.
- **Today:** Stares at an empty CRM; data entry hell; quits.
- **Forleads:** Onboarding scout imports phone contacts (consent) + a chosen farm area, geocodes everyone to Lead Surfaces, and seeds the pipeline. "Here are your first 20 grounded leads." Time-to-value in minutes.
- **Loop:** Onboarding scout → geocode → lead_surface seeding → pipeline.

### UC-6 · Experienced agent with a CRM → overlay, zero migration
- **Trigger:** Pro won't leave Follow Up Boss.
- **Today:** Rejects every new tool that demands migration.
- **Forleads:** Overlay mode imports their CRM read-only (or two-way), maps every contact onto the living map, and enriches each with grounded evidence + next-best-actions — *without* changing their system of record.
- **Loop:** crm_connection sync → enrich scouts on demand → actions write back (optional).

### UC-7 · Snap a house → vision-grounded context
- **Trigger:** Agent photographs a property (or uses Mapillary imagery).
- **Today:** Photo sits in a camera roll.
- **Forleads:** Imagery Scout (vision) captions condition/style/roof/materials as *graded observations* ("appears single-story, pitched roof, mature garden — confidence C, from 1 image"). Feeds valuation context and listing copy. Never asserts hidden facts (e.g., "needs a new roof") without grading it.
- **Loop:** Imagery Scout (Gemini vision) → evidence cards → memory.

### UC-8 · Listing creation → copy + ad creatives with CTAs
- **Trigger:** Agent wins a listing; note + photos exist.
- **Today:** Hours in Canva + copywriting.
- **Forleads:** Composer drafts the listing description, 3 social ad variants with **CTAs**, and a just-listed neighbor letter — all in brand voice, all citing only grounded features, all compliance-checked. Drafts to Review Tray.
- **Loop:** Composer (multi-artifact) → linter → Review Tray.

### UC-9 · Find brokers / co-list partners in an area
- **Trigger:** "I need a co-listing partner / referral agent in this district."
- **Today:** LinkedIn guesswork.
- **Forleads:** People Scout surfaces active agents/brokers by *public activity signals* in the area; drafts an intro message. (Lawful public data only.)
- **Loop:** People Scout → ranked partners → intro draft.

### UC-10 · Securing the deal → objection co-pilot + cadence
- **Trigger:** Note: "seller worried it's the wrong time to sell."
- **Today:** Agent improvises; follow-up slips.
- **Forleads:** Situation `objection:timing`. Composer returns a tailored reply mapping to that objection type, plus enrolls a no-drop follow-up cadence so the lead is never forgotten.
- **Loop:** Notes engine (objection typing) → Composer → cadence scheduler.

### UC-11 · After a showing → synthesized seller update
- **Trigger:** Several buyer-feedback notes after an open house.
- **Today:** Agent forgets to update the seller; trust erodes.
- **Forleads:** Aggregates feedback notes into a clean, honest seller update (themes, price signals) and drafts it for review. Keeps the seller relationship warm automatically.
- **Loop:** Notes (batch) → summarize → Composer → Review Tray.

### UC-12 · Compliance guardrail → every message is safe
- **Trigger:** Any generated outreach, anywhere in the app.
- **Today:** Agents accidentally write fair-housing-risky copy ("great family neighborhood near churches") and risk their license.
- **Forleads:** The Compliance Linter screens *every* artifact, blocks protected-class targeting/steering, and suggests compliant fixes inline. A safety feature competitors treat as an afterthought.
- **Loop:** Compliance linter on the path of every Composer output (fail-closed).

---

## Coverage matrix (which novel mechanic powers each case)
| Mechanic | UCs it powers |
|---|---|
| Note → next-best-action | 1, 2, 8, 10, 11 |
| Grounded evidence cards + grades | 2, 3, 7, 9 |
| Ambient map scouts / spatial farming | 3 |
| Standing Watcher agents | 4 |
| Two front doors (CRM-native / overlay) | 5, 6 |
| Vision grounding | 7, 8 |
| Compliance linter (fail-closed) | 1, 2, 8, 12 |
| Spatial RAG memory | all (compounds over time) |

*Each case maps to acceptance tests in `Forleads_BuildPlan_Friday_v1.md` and to screens in `Forleads_Screens_v1.md`.*
