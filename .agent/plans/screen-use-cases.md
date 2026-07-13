# Per-screen real-estate use cases — the grounding doc for all UI phases

> Model-agnostic. Every UI change must serve one of these named job stories.
> A control that serves none of them gets removed, not polished. Copy carries
> honest psychological pull (FOMO/scarcity/ownership) — never fake signals.

Persona: **solo residential agent or 2–5 person team**, farming 1–3
neighborhoods, living in their car between showings, phone-first. Competitor
frame: Clay (data waterfall, table-as-workflow, plain-English agent) — but
Clay knows nothing about parcels, farming, compliance, or door-knocking.

## Map (the windshield)

Job story: *"I'm parked outside 22125 Clarksburg Rd before a knock. In the
30 seconds before I get out, I need: who last bought it, for how much, when,
any distress signal, and flood context — with sources I could defend to a
seller."*

- Primary action: search/tap parcel → graded evidence rail (exists ✓).
- Capture field signal in ≤2 taps while standing on the porch (exists ✓).
- GAP (Phase 2): waterfall trace — "which sources answered, which missed,
  what a deeper (paid) scan would add" as a visible cascade, so the agent
  knows whether a gap is *no data exists* or *no source configured*.
- GAP: one-tap "add to farm" from the rail; today tracking is implicit.

## Inbox (the morning desk)

Job story: *"Coffee, 7:40am. Show me every prepared draft waiting on my
approval, why it exists (which loop/signal), and let me approve-and-send to
Gmail in under a minute for the whole stack."*

- GAP: batch review flow — approve/skip/edit cards in sequence with
  keyboard/swipe cadence; today it's one-at-a-time clicking.
- GAP: each draft must cite its triggering evidence chip inline (loop name +
  signal + date), so approval is an informed act, not rubber-stamping.

## Loops (the autopilot contract)

Job story: *"When a lead goes quiet for 7 days, prepare the nurture bump; the
moment I log a reply, prepare the response. I approve everything; nothing
leaves without me."*

- Exists ✓ (stale-revival, reply-drafts, listing-prep). Runs/produced/blocked
  counters are honest.
- GAP: loop templates are generic; each should name its evidence («why this
  cadence») and let the agent tune N-days with one control.
- GAP (Phase 4): plain-English goal prompt → composed loop + lead list
  ("every pre-1980 house on my farm street with an open code violation →
  weekly check + prepared letter").

## Pipeline (the money board)

Job story: *"Which of my tracked properties moved stage this week, and which
have fresh distress/sale signals I haven't acted on? Rank my day."*

- GAP (Phase 3, the Clay table): farm table view — rows = tracked leads,
  columns = evidence kinds (last sale, assessed, distress, flood, last touch,
  next action), each cell graded + dated; CSV farm-list import; bulk
  waterfall run; enriched CSV export. This is the direct Clay-table
  equivalent and the biggest competitive wedge.

## Connect (the honesty panel)

Job story: *"What data am I actually standing on, what would one paid key
unlock in MY market, and what can I hand my broker to approve?"*

- Exists ✓: fail-closed setup-required cards with exact env keys.
- GAP (Phase 5): provider logos/monograms for instant recognition; per-card
  "what this unlocks in your market" (bbox-aware: a Maryland agent sees
  Maryland examples); copy-paste setup block per provider; "email this list
  to your broker" for the human-gated items (MLS, ATTOM).

## Report (the accountability mirror)

Job story: *"Friday: what did the system do for me this week — signals found,
drafts prepared, approvals, replies — and where did it fail or stay blocked?"*

- GAP: failure honesty section — blocked loops, degraded providers, and
  setup-required stops belong ON the report (accountability-show-failures P1),
  with the fix action next to each.

## Standing rules for every screen

1. Every claim card: source name + as-of date + grade, or an honest gap.
2. Every gap: the exact unlock (env var, OAuth click, paid key) named inline.
3. Every prepared action: human approval before anything leaves Forleads.
4. Mobile-first: the Map and Inbox jobs happen in a parked car at 390px.
