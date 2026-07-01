import type { EvidenceCard, Note } from "@/lib/core/types";
import { nowISO } from "@/lib/core/ids";

export type SellerUpdateThemeKind =
  | "price"
  | "condition"
  | "layout"
  | "location"
  | "volume"
  | "other";

export interface SellerUpdateTheme {
  kind: SellerUpdateThemeKind;
  label: string;
  mentions: number;
  supportingNoteIds: string[];
  confidence: "A" | "B" | "C" | "D";
}

export interface SellerUpdateSummary {
  themes: SellerUpdateTheme[];
  showingsCounted: number;
  windowDays: number;
  noteIds: string[];
  truncated: boolean;
  droppedThemeCount: number;
  excludedNoteIds: string[];
}

export interface SellerUpdateComposeContext {
  themes: SellerUpdateTheme[];
  showingsCounted: number;
  windowDays: number;
  noteIds: string[];
  truncated?: boolean;
}

interface ThemeMatcher {
  kind: Exclude<SellerUpdateThemeKind, "volume" | "other">;
  label: string;
  patterns: RegExp[];
}

const DEFAULT_WINDOW_DAYS = 14;
const MAX_NOTES = 200;

const THEME_MATCHERS: ThemeMatcher[] = [
  {
    kind: "price",
    label: "Pricing feedback",
    patterns: [
      /\bprice (felt|feels|seemed|seems|is|was) (too )?(high|steep|expensive)\b/i,
      /\b(overpriced|too expensive|priced high|pricey)\b/i,
      /\b\d{1,2}\s*[-–]\s*\d{1,2}\s*%?\s*(high|over)\b/i,
      /\bwould (offer|pay) (less|under)\b/i,
    ],
  },
  {
    kind: "condition",
    label: "Condition feedback",
    patterns: [
      /\b(kitchen|bath|bathroom|carpet|roof|paint|fixtures?)\b.*\b(dated|old|tired|worn)\b/i,
      /\b(needs?|needed) (work|repairs?|updates?|renovation)\b/i,
      /\bcondition\b/i,
      /\bdated\b/i,
    ],
  },
  {
    kind: "layout",
    label: "Layout feedback",
    patterns: [
      /\btoo (small|cramped|narrow)\b/i,
      /\b(layout|floor ?plan|flow)\b/i,
      /\b(bedrooms?|bathrooms?|stairs?)\b.*\b(issue|concern|small|awkward)\b/i,
      /\bnot enough (space|storage|bedrooms?|bathrooms?)\b/i,
    ],
  },
  {
    kind: "location",
    label: "Location feedback",
    patterns: [
      /\b(location|neighborhood|neighbourhood|street|block)\b.*\b(concern|issue|busy|noise|noisy)\b/i,
      /\b(traffic|road noise|commute|parking)\b/i,
      /\btoo far\b/i,
    ],
  },
];

const OPT_OUT_PATTERNS = [
  /\bdo not contact\b/i,
  /\bdon't contact\b/i,
  /\bstop contacting\b/i,
  /\bremove me\b/i,
  /\blose my number\b/i,
];

function confidenceFor(mentions: number): SellerUpdateTheme["confidence"] {
  if (mentions >= 3) return "A";
  if (mentions === 2) return "B";
  if (mentions === 1) return "C";
  return "D";
}

function inWindow(note: Note, cutoffMs: number): boolean {
  const created = Date.parse(note.created_at);
  return Number.isFinite(created) && created >= cutoffMs;
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

export function summarizeShowingFeedback(
  notes: Note[],
  opts: { now?: Date; windowDays?: number } = {},
): SellerUpdateSummary {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = opts.now ?? new Date();
  const cutoffMs = now.getTime() - windowDays * 86400000;
  const excludedNoteIds: string[] = [];

  const inWindowNotes = notes
    .filter((note) => inWindow(note, cutoffMs))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const scopedNotes = inWindowNotes.slice(0, MAX_NOTES);
  const counts = new Map<SellerUpdateThemeKind, { label: string; noteIds: string[] }>();

  for (const note of scopedNotes) {
    if (OPT_OUT_PATTERNS.some((pattern) => pattern.test(note.body))) {
      excludedNoteIds.push(note.id);
      continue;
    }
    for (const matcher of THEME_MATCHERS) {
      if (!matcher.patterns.some((pattern) => pattern.test(note.body))) continue;
      const current = counts.get(matcher.kind) ?? { label: matcher.label, noteIds: [] };
      current.noteIds.push(note.id);
      counts.set(matcher.kind, current);
    }
  }

  if (scopedNotes.length >= 2) {
    counts.set("volume", {
      label: "Showing volume",
      noteIds: scopedNotes
        .filter((note) => !excludedNoteIds.includes(note.id))
        .map((note) => note.id),
    });
  }

  const allThemes: SellerUpdateTheme[] = [...counts.entries()].map(([kind, value]) => {
    const supportingNoteIds = uniq(value.noteIds);
    return {
      kind,
      label: value.label,
      mentions: supportingNoteIds.length,
      supportingNoteIds,
      confidence: confidenceFor(supportingNoteIds.length),
    };
  });

  const themes = allThemes
    .filter((theme) => theme.confidence === "A" || theme.confidence === "B")
    .filter((theme) => theme.supportingNoteIds.length > 0)
    .sort((a, b) => {
      if (b.mentions !== a.mentions) return b.mentions - a.mentions;
      const rank: Record<SellerUpdateThemeKind, number> = {
        price: 0,
        condition: 1,
        layout: 2,
        location: 3,
        volume: 4,
        other: 5,
      };
      return rank[a.kind] - rank[b.kind];
    })
    .slice(0, 5);

  return {
    themes,
    showingsCounted: scopedNotes.length,
    windowDays,
    noteIds: scopedNotes.map((note) => note.id),
    truncated: inWindowNotes.length > MAX_NOTES,
    droppedThemeCount: allThemes.length - themes.length,
    excludedNoteIds,
  };
}

export function sellerUpdateEvidence(summary: SellerUpdateSummary, leadId: string): EvidenceCard[] {
  return summary.themes.map((theme) => ({
    lead_surface_id: leadId,
    scout: "market",
    claim: `${theme.label} buyer-feedback theme`,
    value: `${theme.mentions} of ${summary.showingsCounted} in-window showing notes`,
    sources: theme.supportingNoteIds.map((id) => ({
      name: `Showing feedback note ${id}`,
      url: `note://${id}`,
      as_of: nowISO(),
    })),
    confidence: theme.confidence,
    reasoning: `${theme.label} appeared in ${theme.mentions} independent in-window showing notes.`,
    created_at: nowISO(),
  }));
}
