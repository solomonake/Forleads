# 08 · Forleads — Screens & Wireframes (v1)

> Low-fi wireframes for every key screen across **desktop web**, **mobile web**, and **native phone**. The native and mobile-web layouts are identical (same RN components); the desktop layout reflows the same content into rails. ASCII here; the *feel* lives in `prototype/index.html` and `Forleads_DesignSystem_v1.md`.

Legend: `▣` map · `◉` scout beacon · `▤` evidence card · `⬢` grade chip · `✎` note · `✉` draft

---

## S1 · Map Workspace — DESKTOP
```
┌───────────────────────────────────────────────────────────────────────────┐
│  ⌗        ┌──────────────  ⌘K  Search an address…  ──────────────┐         │
│  Tools    └──────────────────────────────────────────────────────┘         │
│  rail                                                                       │
│  56px      ▣▣▣▣▣▣▣▣▣  MAP (full-bleed)  ▣▣▣▣▣▣▣▣▣        ┌── LEAD RAIL ──┐ │
│  ┌──┐                                                     │ 12 Oak Street  │ │
│  │🛰│      ▣▣▣▣▣▣   ◉ (aqua beacon, breathing)  ▣▣▣        │ Researching ●  │ │
│  │⌖ │      ▣▣▣▣  [active footprint highlighted aqua] ▣     │────────────────│ │
│  │❤│      ▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣        │ SCOUT FEED     │ │
│  │⬢│                                                       │ ▤ Built ~1936 ⬢A│ │
│  └──┘      ▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣        │ ▤ ~180 m²    ⬢B│ │
│                                                            │ ▤ Street img ⬢A│ │
│                                                            │ ▤ Comp ~€X   ⬢C│ │
│                                                            │ ▤ Flood: low ⬢B│ │
│  [© OSM · Imagery © Esri · © Mapillary CC-BY-SA]           │────────────────│ │
│                                                            │ ✎ Add a note…  │ │
│                                                            │ [✉ Actions (1)]│ │
│                                                            └────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```
- Left **Tools rail**: aerial toggle, recenter, watchers, grade legend.
- Right **Lead Rail** (380–420px): address header + status, **Scout Feed** (cards stream in), Note composer, Actions button (count = drafts waiting).

## S1 · Map Workspace — MOBILE / NATIVE
```
┌─────────────────────────┐
│ ⌘K  Search address…   ⚙ │  ← floating pill
│                         │
│ ▣▣▣▣  ◉ beacon  ▣▣▣▣▣ │
│ ▣▣ [footprint aqua] ▣▣ │   MAP full-bleed
│ ▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣ │
│                    ⌖ 🛰 │  ← thumb controls
│╭───────────────────────╮│
││ 12 Oak Street    ●    ││  ← BOTTOM SHEET (peek)
││ ▤ Built ~1936    ⬢A   ││     drag up → half → full
││ ▤ ~180 m²        ⬢B   ││
││ ✎ note   [✉ Actions 1]││
│╰───────────────────────╯│
└─────────────────────────┘
```
- **Bottom sheet** detents: peek 96px / half / full. Same content as the desktop rail.
- 20-second door test: open → search → arrive → read top cards, all within the peek state.

---

## S2 · Lead Surface — full sheet (scouts + evidence)
```
┌ 12 Oak Street, [city] ─────────────── ● Researching ┐
│ ⬢ Overall grade: B · 5 scouts · 2.4s                │
│─────────────────────────────────────────────────────│
│ PROPERTY   ▤ Built ~1936        ⬢A  © OSM  ·  why? > │
│            ▤ Footprint ~180 m²  ⬢B  © OSM            │
│ IMAGERY    ▤ Single-story, pitched roof ⬢C (1 img)   │
│            [▦ street]  [▦ aerial]   © Mapillary/Esri │
│ PEOPLE     ▤ Likely owner-occupied  ⬢C  public recs  │
│ MARKET     ▤ Est. €X–€Y           ⬢C  3 weak comps   │
│            "Insufficient recent comps — here's why >"│
│ RISK       ▤ Flood risk: low      ⬢B  © [src]        │
│─────────────────────────────────────────────────────│
│ ✎ Add note (type or 🎤)                              │
└─────────────────────────────────────────────────────┘
```
- Every row = evidence card with grade + source. Money claims show their grade loudly; grade-D shows the honest gap.

## S3 · Note → Next-Best-Action
```
✎ "knocked, no answer, nice yard"  🎤
        ↓  (aqua "thinking" chip)
┌ Suggested next step ───────────────────────┐
│ Situation: No contact                       │
│ ▸ Warm follow-up letter  (recommended)      │
│ ▸ Retry knock task in 4 days                │
│ ▸ Add to 6-month nurture                    │
│        [Draft it →]                         │
└─────────────────────────────────────────────┘
```

## S4 · Review Tray — drafted email
```
┌ ✉ Draft · ready for your review ──────────── Compliance ✓ ┐
│ From:  Marcus Lee <marcus@…>     (your signature attached) │
│ To:    [owner contact]                                     │
│ Subj:  A quick note about your home on Oak Street          │
│───────────────────────────────────────────────────────────│
│ Hi there, I stopped by today and was struck by what a      │
│ well-kept home you have on Oak Street… [brand voice]       │
│                                                            │
│ Evidence used: ▤ Built ~1936 (A) · ▤ neighborhood (A)      │
│───────────────────────────────────────────────────────────│
│   [ Approve & Send ]   [ Edit ]   [ Discard ]              │
└───────────────────────────────────────────────────────────┘
```
- Nothing sends without **Approve**. Compliance ✓ means the linter passed (or shows flags to fix).

## S5 · Street imagery sheet
```
┌ Street view · 12 Oak Street ─────────────┐
│ ◀  [ Mapillary image, faces blurred ]  ▶ │  swipe along sequence
│ [▦ aerial inset]      © Mapillary/Esri    │
│ Imagery Scout: "single-story, mature      │
│ garden, pitched roof" ⬢C                  │
└───────────────────────────────────────────┘
```

## S6 · Pipeline / CRM board (list view, second to the map)
```
NEW(7)   RESEARCH(4)  CONTACTED(9)  APPT(2)   WON(1)
┌─────┐  ┌─────┐      ┌─────┐       ┌─────┐   ┌─────┐
│▣ 12 │  │▣ 4  │      │▣ 88 │       │▣ 3  │   │▣ 9  │
│Oak  │  │Pine │      │Elm  │       │Bay  │   │Fir  │
│⬢B   │  │⬢C   │      │next:│       │next:│   │ ✓   │
│next:│  │next:│      │call │       │tour │   │     │
│letter  │knock│      │Wed  │       │Fri  │   │     │
└─────┘  └─────┘      └─────┘       └─────┘   └─────┘
```
- Each card: mini-map thumbnail, grade, **next action due**. Drag to change status. Overlay mode shows imported CRM records here too.

## S7 · Buyer Watchers (standing agents)
```
┌ Watchers ───────────────────────────────┐
│ ● 3-bed garden < €X · District A         │
│   last run 2h ago · 1 new hit  [view]    │
│ ● Loft, walkable · District B            │
│   last run 1h ago · 0 hits               │
│            [+ New watcher]               │
└──────────────────────────────────────────┘
```

## S8 · Onboarding (the two front doors)
```
Step 1  ┌ How do you work today? ─────────────┐
        │ ( ) I'm new — set me up (CRM-native)│
        │ ( ) I have a CRM — overlay it       │
        └─────────────────────────────────────┘
Step 2a (new)     → import phone contacts? + pick a farm area on the map
Step 2b (overlay) → connect CRM (read-only first) → enrich on map
Step 3  → pick brand voice (Warm-local / Crisp-pro / Luxury) + add signature
Step 4  → drops you onto the map with your first grounded leads + a guided fly-to
```

## S9 · Profile / brand-voice & compliance settings
- Identity: name, email, signature, photo, locale/language.
- Brand voice: preset + 2–3 of your own message samples (Composer learns tone).
- Data sources: connect per-market providers (bring your key) + see what's free.
- Compliance: region (fair-housing ruleset), spend caps, scouts/day.

---

## Responsive rules
- **≥ 1024px:** rails (left tools 56px, right lead 380–420px), map center.
- **600–1023px:** collapsible right rail becomes an overlay sheet; tools rail → top icons.
- **< 600px / native:** bottom-sheet pattern, floating command pill, thumb controls.
- One component tree (RN + RN Web); only container chrome reflows. The `<Map>` adapter swaps GL JS ↔ MapLibre Native underneath.

## Device matrix to validate
Phone (375–430px), foldable, tablet (768–1024px), laptop (1280–1440px), desktop (1920px+). Test fly-to fps, bottom-sheet drag, evidence-card streaming, and the attribution bar on every size.
