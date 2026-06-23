// ============================================================================
// Design tokens — "Cartographic Luxe". The ONLY source of truth for color,
// type, motion. Values are verbatim from docs/Forleads_DesignSystem_v1.md §1
// and prototype/index.html. Never hardcode a color anywhere else.
// ============================================================================

export const tokens = {
  color: {
    bg: "#0A0E14",
    surface: "#121822",
    surface2: "#1A2230",
    elevated: "#222C3D",
    hairline: "#26334A",
    hairlineStrong: "#33425C",
    text: "#E8EDF4",
    text2: "#9AA7B8",
    textMuted: "#5E6B7E",
    brand: "#7C8CFF",
    brandPress: "#5D6DF0",
    signal: "#2DE0C8",
    signalSoft: "rgba(45,224,200,.14)",
    gradeA: "#38D39F",
    gradeB: "#6E8BFF",
    gradeC: "#F4B740",
    gradeD: "#8A94A6",
    stNew: "#7C8CFF",
    stResearch: "#2DE0C8",
    stContacted: "#F4B740",
    stAppt: "#38D39F",
    stWon: "#27C499",
    stDead: "#6B7688",
    danger: "#FF6B6B",
    warn: "#F4B740",
    ok: "#38D39F",
  },
  radius: { sm: "8px", md: "12px", lg: "18px", pill: "999px" },
  motion: {
    easeFly: "cubic-bezier(.22,.61,.36,1)",
    easeCard: "cubic-bezier(.16,1,.3,1)",
    durFly: "1800ms",
    durCard: "420ms",
  },
  font: {
    sans: 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    mono: 'ui-monospace,"JetBrains Mono","SF Mono",Menlo,monospace',
  },
} as const;

export type GradeColorKey = "A" | "B" | "C" | "D";

export const gradeColor: Record<GradeColorKey, string> = {
  A: tokens.color.gradeA,
  B: tokens.color.gradeB,
  C: tokens.color.gradeC,
  D: tokens.color.gradeD,
};

export const statusColor: Record<string, string> = {
  new: tokens.color.stNew,
  researching: tokens.color.stResearch,
  contacted: tokens.color.stContacted,
  nurturing: tokens.color.stContacted,
  appointment: tokens.color.stAppt,
  won: tokens.color.stWon,
  dead: tokens.color.stDead,
};

/** The grade legend, used by the persistent Confidence Legend component. */
export const gradeLegend: { grade: GradeColorKey; label: string }[] = [
  { grade: "A", label: "Official record / recent verified" },
  { grade: "B", label: "Modeled from ≥3 signals" },
  { grade: "C", label: "Sparse / single weak signal" },
  { grade: "D", label: "Insufficient — we say so" },
];
