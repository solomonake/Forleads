import type { EvidenceCard, FieldSignal, NoteClassification } from "@/lib/core/types";
import { nowISO, uuid } from "@/lib/core/ids";

const CONDITION_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "tall grass", pattern: /\b(tall|overgrown)\s+grass\b/i },
  { label: "boarded windows", pattern: /\b(boarded|boarded-up)\b/i },
  { label: "vacant-looking", pattern: /\b(vacant|empty|abandoned|moved out)\b/i },
  { label: "deferred maintenance", pattern: /\b(repair|repairs|peeling|broken|trash|junk|roof|gutters?)\b/i },
  { label: "mail piled up", pattern: /\b(mail|letters?|package)s?\s+(piled|stacked|overflowing)\b/i },
];

export function extractFieldSignal(body: string): FieldSignal {
  const observed = CONDITION_PATTERNS.filter((entry) => entry.pattern.test(body)).map((entry) => entry.label);
  const contactSeen = /\b(owner|seller|tenant|neighbor|neighbour|occupant)\b/i.exec(body)?.[0];
  const statement = /\b(owner|seller|neighbor|neighbour|tenant)\s+(said|says|told|mentioned)\b/i.test(body)
    ? body.trim().slice(0, 240)
    : undefined;

  return {
    observed_condition: Array.from(new Set(observed)),
    contact_seen: contactSeen,
    owner_statement: statement,
    photo_pending:
      !/\b(attached|uploaded|took|sent|added)\s+(a\s+)?(photo|picture|image|snapshot)\b/i.test(body),
    route_seen_at: nowISO(),
  };
}

export function fieldSignalEvidence(
  body: string,
  classification: NoteClassification,
): EvidenceCard[] {
  const signal = extractFieldSignal(body);
  const cards: EvidenceCard[] = [];
  const observed = signal.observed_condition.length ? signal.observed_condition.join(", ") : null;

  cards.push({
    id: uuid(),
    scout: "imagery",
    claim: "Operator field condition",
    value: observed,
    sources: [{ name: "Operator field note", as_of: signal.route_seen_at }],
    confidence: signal.observed_condition.length ? "C" : "D",
    reasoning:
      signal.observed_condition.length
        ? "Operator observation from field capture. This is not a structural inspection or public-record owner truth."
        : "The note was captured, but no recognized condition tag was found yet.",
    created_at: signal.route_seen_at,
  });

  if (signal.owner_statement || classification.situation === "interested_seller") {
    cards.push({
      id: uuid(),
      scout: "people",
      claim: "Operator-captured contact signal",
      value: signal.owner_statement ?? classification.situation.replace(/[_:]/g, " "),
      sources: [{ name: "Operator field note", as_of: signal.route_seen_at }],
      confidence: "C",
      reasoning:
        "Contact or intent was captured by the operator. Use it for follow-up context, not as a public-record identity claim.",
      created_at: signal.route_seen_at,
    });
  }

  if (signal.photo_pending) {
    cards.push({
      id: uuid(),
      scout: "imagery",
      claim: "Field photo",
      value: null,
      sources: [],
      confidence: "D",
      reasoning: "No field photo is attached yet. Capture a photo to strengthen the scout record.",
      created_at: signal.route_seen_at,
    });
  }

  return cards;
}
