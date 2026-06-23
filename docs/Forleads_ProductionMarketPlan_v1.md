# 11 · Forleads — Production Market Plan (v1)

Captured June 2026 after reading the full `Forleads/` folder and re-checking current market / platform sources.

## 1. Executive read

Forleads should move past "MVP CRM" and become a **spatial agentic operating system for real-estate work**:

> A living map that turns addresses, notes, CRM records, inbox events, and buyer criteria into grounded, reviewable actions across email, SMS, calendar, CRM, and market data tools.

The strongest product shape is not "AI for real estate agents." That is too generic. The strong shape is:

> **Zapier for real estate action loops, with a grounded agent brain and a map as the source of truth.**

Zapier connects tools. Forleads should connect **place + evidence + intent + workflow + outcome**.

## 2. Market reality

### What is true right now

- Agents are under pressure. A 2026 WSJ report said U.S. Realtor membership was about 1.4M in April 2026, down from the 1.6M peak in October 2022, and fewer agents reported real estate as their only profession. That makes "save me time and help me win deals" more urgent than "give me another dashboard."
- Real-estate CRM competition is crowded: Follow Up Boss, kvCORE, LionDesk, RealOffice360, GoHighLevel, HubSpot-style stacks, brokerage tools, spreadsheets, Google contacts, and local MLS/RPR tools.
- Many CRMs already have tasks, automations, templates, email sync, and AI writing. That means Forleads cannot win by saying "we draft emails."
- The real gap is **contextual action**: agents collect observations in the field, but those observations do not reliably become compliant, personalized, evidence-backed follow-up.
- Trust is becoming more valuable as AI noise grows. Fake reviews and generic AI copy are increasing, so Forleads' citation-first stance is not decorative. It is the wedge.

### Market-fit hypothesis

Forleads can win if the first paid users say:

> "This makes sure every property I touch turns into the right next action, already drafted in the tools I use, with the proof attached."

That is a stronger value proposition than:

> "This is a real-estate CRM with AI."

## 3. Who this is for

### Segment A: New solo agents

Pain: empty CRM, no repeatable system, no confidence, no follow-up discipline.

Offer:

- "Pick your farm area. Get your first 20 grounded leads in 10 minutes."
- "Knock, speak a note, get the follow-up drafted."
- "Your CRM teaches you what to do next."

Why they may buy: it gives them a system before they have one.

Risk: low willingness to pay. Keep them as PLG/free/low-cost users and convert the serious ones.

### Segment B: Active solo agents with messy workflow

Pain: contacts in Gmail, texts, CRM, notebook, phone, Zillow/Realtor leads, open-house notes.

Offer:

- "Stop losing follow-up between tools."
- "Every note becomes a reviewable action."
- "Your week is summarized by lead movement, missed follow-up, and drafted next steps."

Why they may buy: immediate time recovery and fewer dropped leads.

This is the best first commercial segment.

### Segment C: Teams and brokerages

Pain: managers cannot see lead quality, agent follow-up quality, or field activity without micromanaging.

Offer:

- "Team territory map + action compliance + follow-up reporting."
- "See which leads are grounded, which actions are waiting, which agents are stuck."
- "Compliance linter and audit trail for generated outreach."

Why they may buy: visibility, consistency, compliance, and better conversion.

Risk: longer sales cycle. Build later, but design permissions and audit logs now.

### Segment D: Existing CRM power users

Pain: they have a system of record but the CRM is passive.

Offer:

- "Keep Follow Up Boss / GoHighLevel. Forleads enriches and activates it."
- "We write back notes, tasks, draft links, tags, and action outcomes."

Why they may buy: no migration.

This should be the pro wedge.

## 4. Novel scenarios real agents would feel

### Scenario 1: Door knock turns into a Gmail draft

Agent taps a house, scouts ground property context, agent says: "Knocked, no answer, nice yard." Forleads removes risky details, drafts a warm email/letter, creates a retry task, and optionally places the draft directly in Gmail using Gmail Drafts API.

Novelty: the note is not stored; it becomes work prepared inside the user's real tool.

### Scenario 2: Follow-up loop that reports itself

Agent chooses "nurture every 45 days." Forleads creates a loop:

```
trigger: no reply after 7 days
check: last contact + lead status + compliance + user cadence preference
action: draft follow-up + create CRM task
report: weekly "5 drafts prepared, 2 stale leads, 1 high-intent seller needs call"
```

Novelty: it is automation with judgment, not a dumb drip campaign.

### Scenario 3: Map-based farming loop

Agent lassos a neighborhood. Forleads runs cheap ambient scouts, ranks properties by lawful public signals, creates a daily route, and drafts address-specific outreach only when enough evidence exists.

Novelty: territory farming becomes an agentic loop tied to place, not a spreadsheet export.

### Scenario 4: Buyer watcher

Agent says: "My buyer wants a 3-bed with a garden under $X in this area." Forleads creates a standing watcher that checks listings/CRM/imported leads, finds matches, and drafts buyer messages with evidence.

Novelty: the watcher produces human-review artifacts, not just alerts.

### Scenario 5: Seller update from showing notes

After an open house, the agent has scattered voice notes and buyer feedback. Forleads summarizes themes, sentiment, objections, price-sensitivity, and drafts a seller update email.

Novelty: relationship maintenance becomes automatic but still human-approved.

### Scenario 6: CRM overlay enrichment

A pro connects Follow Up Boss. Forleads maps people to lead surfaces, enriches records on demand, and writes back:

- note summary
- evidence summary
- next action
- task due date
- draft artifact URL
- tags such as `needs_cma`, `no_contact`, `timing_objection`

Novelty: Forleads becomes the action intelligence layer without replacing the CRM.

## 5. Production architecture upgrade

The current docs have the right scout architecture. To become production-ready, add an **Action Loop Engine** and **Connector Layer** as first-class systems.

```
Map / CRM / Inbox / Notes / Watchers
        ↓
Event Bus: lead.tapped, note.created, email.reply, task.due, watcher.hit
        ↓
Grounding Layer: evidence cards, memory, source adapters
        ↓
Policy Layer: permissions, compliance, rate limits, spend budgets
        ↓
Planner: choose action loop, explain why, ask if uncertain
        ↓
Artifact Builder: draft email/SMS/task/calendar/CRM update/proposal
        ↓
Approval Queue: human review, edit, approve, reject, snooze
        ↓
Connectors: Gmail, Outlook, Calendar, Follow Up Boss, GoHighLevel, Twilio, MLS/RPR, Zapier
        ↓
Outcome Memory: sent/replied/booked/won/lost/stale
        ↓
Learning Reports: what worked, what tools matter, what loops should change
```

### Core services

- `events`: append-only domain event log.
- `loops`: durable workflow definitions and loop runs.
- `connectors`: OAuth, tokens, scopes, provider health, retries.
- `artifacts`: generated drafts with evidence, compliance result, model metadata, and approval state.
- `approvals`: queue, edit history, rejection reason, snooze.
- `reports`: weekly/monthly digest and per-loop outcome analytics.
- `policies`: fair housing, opt-out, consent, region rules, send limits.
- `memory`: RAG context from notes, outcomes, agent preferences, brand voice, and corrections.

### Tables to add

```sql
connector_account(
  id uuid primary key,
  agent_id uuid not null,
  provider text not null,
  scopes text[] not null,
  status text not null,
  credentials_ref text not null,
  last_healthcheck_at timestamptz,
  created_at timestamptz default now()
);

domain_event(
  id uuid primary key,
  agent_id uuid not null,
  lead_surface_id uuid,
  type text not null,
  payload jsonb not null,
  source text not null,
  created_at timestamptz default now()
);

loop_definition(
  id uuid primary key,
  agent_id uuid not null,
  name text not null,
  trigger_json jsonb not null,
  conditions_json jsonb not null,
  actions_json jsonb not null,
  cadence_json jsonb,
  active boolean default true,
  created_at timestamptz default now()
);

loop_run(
  id uuid primary key,
  loop_definition_id uuid not null,
  agent_id uuid not null,
  lead_surface_id uuid,
  status text not null,
  planner_trace jsonb not null,
  started_at timestamptz default now(),
  completed_at timestamptz
);

artifact(
  id uuid primary key,
  agent_id uuid not null,
  lead_surface_id uuid,
  loop_run_id uuid,
  type text not null,
  status text not null,
  payload_json jsonb not null,
  evidence_used jsonb not null,
  compliance_result jsonb not null,
  model_trace jsonb not null,
  external_draft_ref jsonb,
  created_at timestamptz default now(),
  approved_at timestamptz,
  sent_at timestamptz
);
```

## 6. Connector strategy

### Phase 1: Google Workspace

Start here because it proves the user's desired "ready in my drafts" magic.

- Gmail: create/update drafts; send only after approval.
- Google Calendar: create appointment holds and buyer/seller meetings.
- Google Contacts: optional import.
- Google Drive/Docs: proposal packet and CMA draft storage later.

Implementation note: Gmail drafts require creating an RFC 2822 MIME message, base64URL encoding it, and calling `users.drafts.create`. Google documents this exact flow.

### Phase 2: Microsoft 365

Many agents and brokerages use Outlook. Support it early after Google:

- Outlook draft creation
- Calendar event creation
- contact import

### Phase 3: Real-estate CRMs

Start with one CRM only. I would pick **Follow Up Boss first** because its public API is clear and includes people, notes, tasks, appointments, action plans, automations, webhooks, stages, and deals.

Then add:

- GoHighLevel for agencies / teams.
- kvCORE if API access is obtainable.
- HubSpot as a generic CRM fallback.
- CSV import/export always.

### Phase 4: Messaging and automation

- Twilio or provider-specific SMS for approved texts.
- Zapier / Make as a bridge for unsupported CRMs.
- Webhooks so Forleads can become a platform, not only an app.

## 7. The loop-builder product

You mentioned a "loops kind of system." That should become one of the product's most impressive screens.

### User-facing loop model

```
WHEN something happens
IF the lead/context matches
LET THE AGENT prepare something
REQUIRE my approval for risky actions
THEN write back to my tools
REPORT results on my schedule
```

### Example loops

#### No-contact loop

- Trigger: note contains no-contact / door knock.
- Conditions: lead has address + one contact channel.
- Agent work: draft warm follow-up email, create retry task in 4 days.
- Approval: user approves email; task auto-created.
- Report: include in weekly "door knock conversion" summary.

#### New reply loop

- Trigger: Gmail reply received from a lead.
- Conditions: reply sentiment is positive or asks a question.
- Agent work: summarize reply, suggest response, create appointment hold.
- Approval: approve response and calendar invite.
- Report: high-priority same-day alert.

#### Stale lead loop

- Trigger: no activity after N days.
- Conditions: not dead/won, no opt-out.
- Agent work: draft low-pressure nurture.
- Approval: batch approve.
- Report: "17 stale leads revived this week."

#### Listing prep loop

- Trigger: lead status moves to `appointment` or `seller_interested`.
- Conditions: enough evidence or connected data source.
- Agent work: draft seller proposal email, CMA packet checklist, calendar prep task.
- Approval: review packet.
- Report: listing pipeline forecast.

## 8. Screens to add beyond current docs

### S10 · Action Inbox

```
┌ Action Inbox ───────────────────────────────────────────────┐
│ Tabs: Drafts  Tasks  Calendar Holds  Needs Review  Sent      │
│ Filters: Today · High intent · Compliance flags · By loop     │
│                                                              │
│ ✉ Gmail draft ready      12 Oak St    No-contact loop         │
│   Evidence: property A, imagery C · Compliance ✓              │
│   [Open] [Approve] [Edit] [Snooze]                            │
│                                                              │
│ ⚠ SMS draft blocked      8 Pine Rd    Fair-housing wording    │
│   "family neighborhood" flagged · suggested fix ready         │
│   [Fix] [Discard]                                             │
└──────────────────────────────────────────────────────────────┘
```

Purpose: one place for all work the agents prepared.

### S11 · Loop Studio

```
┌ Loop Studio ────────────────────────────────────────────────┐
│ Active loops                                                │
│ ● No-contact follow-up       42 runs · 18 approved · 5 replies│
│ ● Stale lead revival         17 runs · 9 approved             │
│ ● Buyer watcher              3 hits this week                 │
│                                                              │
│ Builder                                                     │
│ WHEN: Note created + situation = no_contact                  │
│ IF: Contact channel exists + no opt-out                      │
│ DO: Draft email + create retry task                          │
│ APPROVAL: Email requires approval; task can auto-create       │
│ REPORT: Weekly summary every Friday 8am                      │
└──────────────────────────────────────────────────────────────┘
```

Purpose: Zapier-like power, but shaped for real-estate workflows.

### S12 · Connector Hub

```
┌ Connector Hub ──────────────────────────────────────────────┐
│ Google Workspace   Connected · Gmail drafts · Calendar       │
│ Follow Up Boss     Connected · read/write notes/tasks        │
│ GoHighLevel        Not connected                             │
│ Twilio SMS         Needs setup                               │
│ Zapier Webhooks    Copy endpoint                             │
│                                                              │
│ Permissions panel                                            │
│ Gmail: compose drafts only                                   │
│ Calendar: create events                                      │
│ CRM: read contacts, write notes/tasks                        │
└──────────────────────────────────────────────────────────────┘
```

Purpose: make trust visible. Users need to know exactly what Forleads can do.

### S13 · Weekly Intelligence Report

```
┌ Weekly Report · June 22-28 ─────────────────────────────────┐
│ Prepared actions: 38  Approved: 24  Replies: 6  Bookings: 2  │
│                                                              │
│ What changed                                                 │
│ - No-contact loop gets replies when sent within 24h.          │
│ - Timing objections are piling up in West farm.               │
│ - 11 leads have enough evidence for CMA prep.                 │
│                                                              │
│ Recommended changes                                          │
│ [Tighten stale lead loop to 30 days]                          │
│ [Connect Follow Up Boss tasks]                                │
│ [Add seller-update loop]                                      │
└──────────────────────────────────────────────────────────────┘
```

Purpose: make the compounding intelligence visible.

### S14 · Agent Trace / Why This Happened

```
┌ Why this draft exists ──────────────────────────────────────┐
│ Trigger: note.created                                       │
│ Situation: no_contact · confidence 0.91                     │
│ Evidence used: Year built A, imagery C, neighborhood source A│
│ Excluded: "kids' bikes" because familial status risk         │
│ Policy: fair housing passed                                 │
│ Connector: Gmail draft created, not sent                     │
│ Cost: 1 Claude call, 0 paid data calls                       │
└──────────────────────────────────────────────────────────────┘
```

Purpose: founder/recruiter-grade trust and debugging.

## 9. Learning strategy: do not train first

Do not train a model yet.

Forleads should learn from users in this order:

1. **Preference memory**: user edits, approvals, rejections, brand voice samples, preferred cadence, preferred CTAs.
2. **Retrieval**: retrieve prior notes/outcomes before drafting.
3. **Policy tuning**: if user always rejects a loop at a certain stage, suggest changing the loop.
4. **Bandit-style template ranking**: track which templates get approvals/replies/bookings.
5. **Fine-tune later** only for narrow, repeated, high-volume tasks:
   - situation classification from messy field notes
   - property photo condition labels
   - brand-voice rewrite style

Fine-tuning is not how the system "improves itself" at first. The moat is the **closed loop of action/outcome data** plus grounding and connectors.

### What to log from day one

- draft approved / edited / rejected
- exact edit diff
- compliance flags
- time from note to draft
- time from draft to approval
- reply / no reply
- appointment booked
- loop that created the artifact
- evidence used
- connector delivery state

This creates training data later without needing to train prematurely.

## 10. Production guardrails

- No auto-send for email/SMS until trust is earned; even later, require per-loop explicit permission.
- Every outbound artifact needs audit fields: source evidence, model, prompt version, compliance result, approver, timestamp.
- Respect opt-outs and SMS consent.
- Scopes must be minimal. For Gmail, start with compose/drafts rather than broad mailbox access.
- Connector retries need idempotency keys so drafts/tasks are not duplicated.
- Every loop run must be inspectable.
- PII must be tenant-isolated with RLS and encryption for connector tokens.
- Fair-housing linter must fail closed.
- Data-provider claims must keep source and confidence attached all the way to UI and outbound drafts.

## 11. What to build next

### Build 1: Production-grade Gmail draft loop

Goal: user note creates a real Gmail draft and a Forleads action record.

Pieces:

- OAuth Google connection
- `artifact` table
- Gmail draft connector
- Review Tray with "Open in Gmail"
- edit/approve/sent state
- audit trace

This single feature makes the product feel real.

### Build 2: Loop engine

Goal: No-contact loop and stale-lead loop run durably.

Pieces:

- event log
- loop definitions
- scheduled runner
- loop runs
- report digest

### Build 3: Follow Up Boss overlay

Goal: import contacts, enrich on map, write back notes/tasks.

Pieces:

- OAuth/API key connection
- contact sync
- lead surface matching
- notes/tasks write-back
- webhook intake

### Build 4: Weekly Intelligence Report

Goal: show compounding value.

Pieces:

- outcome analytics
- loop recommendations
- missed follow-up detection
- delivered by email and in-app

## 12. How to pitch Forleads

### Founder pitch

> Forleads is an agentic spatial CRM for real-estate professionals. Existing CRMs store leads and remind agents to follow up. Forleads treats every address as a live work surface: it grounds the property context, converts field notes into compliant draft actions, places those drafts into tools like Gmail and Follow Up Boss, and learns from outcomes. The wedge is no-contact follow-up from a map tap; the platform is a real-estate-specific loop engine.

### Recruiter / FAANG pitch

> I built Forleads as a production-oriented agentic workflow system, not just a chatbot. It combines geospatial UX, bounded multi-agent orchestration, citation-first retrieval, compliance policy enforcement, OAuth connectors, durable workflow loops, auditability, and outcome learning. The interesting engineering challenge is making agents useful inside high-trust workflows where hallucination, privacy, duplicate side effects, and compliance risks are unacceptable.

### Short demo script

1. "Agents think spatially, so the map is the home screen."
2. Search an address; the camera flies while scouts gather evidence.
3. Show cited evidence cards with confidence grades.
4. Add note: "knocked, no answer."
5. Show draft created with risky details removed.
6. Open "Why this happened" trace.
7. Show it ready as a Gmail draft / CRM task.
8. Show Weekly Report: actions prepared, replies, appointments, recommended loop changes.

## 13. Why this can stand out

Most AI projects demo generation. Forleads demos **agency under constraints**:

- bounded scouts, not one giant prompt
- source-grounded evidence, not claims
- compliance linter, not vibes
- real tool side effects, but approval-gated
- durable loops, not one-off chats
- map-first domain UX, not a copied dashboard
- memory from outcomes, not "we fine-tuned something" theater

That is exactly the kind of system founders and strong engineering teams care about because it shows judgment around product, architecture, safety, and deployment.

## 14. Source checks

- DOJ Fair Housing Act overview: https://www.justice.gov/crt/fair-housing-act-1
- Gmail Drafts API: https://developers.google.com/workspace/gmail/api/guides/drafts
- Google Calendar Events insert API: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- Follow Up Boss API docs: https://docs.followupboss.com/reference/getting-started
- Zapier Platform docs: https://docs.zapier.com/platform/docs
- NAR research / fair housing resources: https://www.nar.realtor/research-and-statistics and https://www.nar.realtor/fair-housing
- WSJ market pressure context: https://www.wsj.com/real-estate/real-estate-agents-are-quitting-the-slow-housing-market-d95fc524
