# 05 · Forleads — Design System (v1)

**Design language: "Cartographic Luxe."** A dark, map-forward canvas where data glows. The map is the hero; UI is a calm HUD that lets evidence and motion do the talking. Feels like a mission-control built by people who love maps.

## 1. Design tokens (CSS variables — these match `prototype/index.html`)
```css
:root{
  /* Ink / surfaces */
  --bg:#0A0E14; --surface:#121822; --surface-2:#1A2230; --elevated:#222C3D;
  --hairline:#26334A; --hairline-strong:#33425C;
  /* Text */
  --text:#E8EDF4; --text-2:#9AA7B8; --text-muted:#5E6B7E;
  /* Brand + agent signal */
  --brand:#7C8CFF;            /* electric indigo — primary actions */
  --brand-press:#5D6DF0;
  --signal:#2DE0C8;           /* aqua — the agent/scout "alive" color */
  --signal-soft:rgba(45,224,200,.14);
  /* Confidence grades (never a naked number) */
  --grade-a:#38D39F; --grade-b:#6E8BFF; --grade-c:#F4B740; --grade-d:#8A94A6;
  /* Status pipeline */
  --st-new:#7C8CFF; --st-research:#2DE0C8; --st-contacted:#F4B740;
  --st-appt:#38D39F; --st-won:#27C499; --st-dead:#6B7688;
  /* Feedback */
  --danger:#FF6B6B; --warn:#F4B740; --ok:#38D39F;
  /* Radius / elevation / motion */
  --r-sm:8px; --r-md:12px; --r-lg:18px; --r-pill:999px;
  --shadow-1:0 1px 2px rgba(0,0,0,.4);
  --shadow-2:0 8px 30px rgba(0,0,0,.45);
  --shadow-glow:0 0 0 1px var(--signal), 0 0 24px var(--signal-soft);
  --ease-fly:cubic-bezier(.22,.61,.36,1);   /* the camera fly-to easing */
  --ease-card:cubic-bezier(.16,1,.3,1);     /* scout card reveal */
  --dur-fly:1800ms; --dur-card:420ms;
}
```

## 2. Color usage rules
- **Background is the map.** Panels float over it as translucent surfaces (`backdrop-filter: blur(18px)` over `--surface` at ~80% opacity).
- **Aqua `--signal` is sacred:** it marks *agent activity only* — the thinking beacon, streaming scout cards, "working" states. Don't use it for chrome.
- **Indigo `--brand` is for the user's actions** (primary buttons, approve).
- **Grades are always shown as letter + color + dot.** Color alone never carries meaning (accessibility).

## 3. Typography
- **UI:** Inter / system-ui. Weights 400/500/600/700.
- **Data values:** `ui-monospace, "JetBrains Mono"` — every number/measurement is mono so data reads as data.
- **Address display:** 28–34px/600 (the address is a headline; it's the subject of the workspace).
- **Scale:** 12 (micro/labels), 13 (meta), 15 (body), 17 (emphasis), 22 (section), 28–34 (display). Line-height 1.35 body, 1.15 display. Letter-spacing -0.01em on display.

## 4. Spacing & layout
- Base unit **4px**; scale 4/8/12/16/20/24/32/48.
- Panel padding 20; card padding 16; card gap 12.
- **Desktop:** map full-bleed; right **Lead Rail** 380–420px; left collapsible **Map Tools** 56px rail.
- **Mobile:** map full-bleed; **bottom sheet** (3 detents: peek 96px / half / full) holds lead + scouts; thumb-reachable controls bottom-right.

## 5. Core components
| Component | Spec |
|---|---|
| **Command Bar** | Floating top-center pill, 56px tall, blurred. Address search w/ Photon autocomplete. ⌘K opens it. The product's front door. |
| **Lead Rail / Bottom Sheet** | Houses Address header → Scout Feed → Notes → Actions. Same content, different container per platform. |
| **Evidence Card** | Surface-2, radius-md. Row 1: claim + value(mono). Row 2: grade chip (letter+dot) · source link · `as_of`. Tap → "why this grade" expands `reasoning`. Streams in with `--ease-card` staggered 60ms. |
| **Grade Chip** | Pill: colored dot + letter (A/B/C/D) + label. D renders as "Unverified — here's why." |
| **Scout Beacon** | On-map pulsing aqua ring at the target while scouts run; collapses to a count badge when done. The visual "swarm." |
| **Note Composer** | Multiline + mic button (voice). On submit → shows a "thinking" chip → returns suggested action(s). |
| **Action Draft (Review Tray)** | Card showing To / Subject / Body (editable) / Evidence used / Compliance ✓. Buttons: **Approve & Send** (brand), Edit, Discard. |
| **Pipeline Board** | Kanban by status; each card is a lead with mini-map thumbnail + grade + next action due. |
| **Confidence Legend** | Persistent tiny legend so grades are always interpretable. |

## 6. Motion language (the "magical agentic feel" — but honest)
- **Fly-to:** camera eases to target over `--dur-fly` with `--ease-fly`; slight pitch (0→45°) + zoom-in for a "descend onto the house" feel. This window *is* the scout loading time.
- **Arrival pulse:** one aqua ring pulse at the pin on land.
- **Scout cards:** stream in bottom-up, staggered 60ms, `--ease-card`, with a 1px aqua left-border that fades to hairline once "settled."
- **Thinking beacon:** soft breathing aqua glow while any scout is active; stops the instant work stops (never fake).
- **Approve:** the draft card flies into a "sent" checkmark; subtle haptic on mobile.
- **Reduce motion:** respect `prefers-reduced-motion` → cross-fades instead of travel; fly-to becomes a 250ms fade.

## 7. Iconography & map style
- Line icons, 1.5px stroke, rounded; aqua only when indicating agent state.
- **Map style:** Protomaps "dark/ink" theme tuned to `--bg`; roads desaturated; buildings get a subtle extrude at high zoom; the active parcel/footprint highlights in aqua at 12% fill + 1px stroke.

## 8. Accessibility
- WCAG AA contrast on all text over surfaces (verify `--text-2` over `--surface` ≥ 4.5:1).
- Grade never by color alone (letter + dot + label).
- Full keyboard path: ⌘K search, arrow to cards, Enter to expand, ⌘↵ to approve.
- Voice notes have a typed fallback; all imagery has alt text from the Imagery Scout caption.
- Hit targets ≥ 44px on mobile.

## 9. Brand voice (for generated copy)
- Default: warm, concise, professional, never pushy; mirrors the agent's own samples once provided.
- Three presets agents can pick at onboarding: **Warm-local**, **Crisp-pro**, **Luxury**. Each is a parameter set the Composer reads from `agent.brand_voice_json`.

*All tokens here are the single source of truth; the prototype and both app shells import these exact values.*
