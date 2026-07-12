import type { EvidenceCard, EvidenceSource } from "@/lib/core/types";

export type SourceFreshnessStatus = "current" | "stale" | "future" | "invalid" | "unknown";

export interface SourceFreshness {
  status: SourceFreshnessStatus;
  label: string;
  asOf?: string;
  ageDays?: number;
}

const DEFAULT_STALE_AFTER_DAYS = 365 * 2;

export function parseEvidenceDate(value: string | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return new Date(`${trimmed}-01T00:00:00.000Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return new Date(`${trimmed}T00:00:00.000Z`);
  return null;
}

function normalizeToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function sourceFreshness(
  source: EvidenceSource,
  now = new Date(),
  staleAfterDays = DEFAULT_STALE_AFTER_DAYS,
): SourceFreshness {
  if (!source.as_of) return { status: "unknown", label: "date unknown" };
  const parsed = parseEvidenceDate(source.as_of);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return { status: "invalid", label: "invalid source date", asOf: source.as_of };
  }
  const today = normalizeToday(now);
  const ageDays = Math.floor((today.getTime() - parsed.getTime()) / 86_400_000);
  if (ageDays < 0) return { status: "future", label: "future source date", asOf: source.as_of, ageDays };
  if (ageDays > staleAfterDays) return { status: "stale", label: `stale · ${source.as_of}`, asOf: source.as_of, ageDays };
  return { status: "current", label: `as of ${source.as_of}`, asOf: source.as_of, ageDays };
}

export function cardFreshness(
  card: EvidenceCard,
  now = new Date(),
  staleAfterDays = DEFAULT_STALE_AFTER_DAYS,
): SourceFreshness {
  if (!card.sources.length) return { status: "unknown", label: "date unknown" };
  const sourceStates = card.sources.map((source) => sourceFreshness(source, now, staleAfterDays));
  const priority: SourceFreshnessStatus[] = ["future", "invalid", "stale", "current", "unknown"];
  for (const status of priority) {
    const state = sourceStates.find((candidate) => candidate.status === status);
    if (state) return state;
  }
  return { status: "unknown", label: "date unknown" };
}

