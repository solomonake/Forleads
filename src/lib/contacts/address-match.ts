// Conservative U.S. address fingerprints for CRM-to-lead binding. This is an
// exact normalized match, not ownership inference or fuzzy geocoding.

const TOKENS: Record<string, string> = {
  street: "st", avenue: "ave", boulevard: "blvd", road: "rd", drive: "dr",
  lane: "ln", court: "ct", circle: "cir", terrace: "ter", place: "pl",
  parkway: "pkwy", highway: "hwy", trail: "trl", way: "way",
  north: "n", south: "s", east: "e", west: "w",
  northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
  apartment: "unit", apt: "unit", suite: "unit", ste: "unit", number: "unit",
};

const STATES: Record<string, string> = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca",
  colorado: "co", connecticut: "ct", delaware: "de", florida: "fl", georgia: "ga",
  hawaii: "hi", idaho: "id", illinois: "il", indiana: "in", iowa: "ia",
  kansas: "ks", kentucky: "ky", louisiana: "la", maine: "me", maryland: "md",
  massachusetts: "ma", michigan: "mi", minnesota: "mn", mississippi: "ms",
  missouri: "mo", montana: "mt", nebraska: "ne", nevada: "nv",
  "new hampshire": "nh", "new jersey": "nj", "new mexico": "nm", "new york": "ny",
  "north carolina": "nc", "north dakota": "nd", ohio: "oh", oklahoma: "ok",
  oregon: "or", pennsylvania: "pa", "rhode island": "ri", "south carolina": "sc",
  "south dakota": "sd", tennessee: "tn", texas: "tx", utah: "ut", vermont: "vt",
  virginia: "va", washington: "wa", "west virginia": "wv", wisconsin: "wi",
  wyoming: "wy", "district of columbia": "dc",
};

const STATE_CODES = new Set(Object.values(STATES));

export function addressFingerprint(input: string): string | null {
  let normalized = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const [name, code] of Object.entries(STATES).sort((a, b) => b[0].length - a[0].length)) {
    normalized = normalized.replace(new RegExp(`\\b${name}\\b`, "g"), code);
  }
  const tokens = normalized
    .replace(/\b(?:united states of america|united states|usa|us)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => TOKENS[token] ?? token);
  if (tokens.length < 5) return null;
  if (!tokens.some((token) => /^\d+[a-z]?$/.test(token))) return null;
  if (!tokens.some((token) => STATE_CODES.has(token))) return null;
  return tokens.join(" ");
}

export function sameContactIdentity(
  existing: { email?: string; phone?: string },
  incoming: { email?: string; phone?: string },
): boolean {
  const email = (value: string | undefined) => value?.trim().toLowerCase();
  const phone = (value: string | undefined) => {
    const digits = value?.replace(/\D/g, "") ?? "";
    return digits.length >= 10 ? digits.slice(-10) : undefined;
  };
  return Boolean(
    (email(existing.email) && email(existing.email) === email(incoming.email))
    || (phone(existing.phone) && phone(existing.phone) === phone(incoming.phone)),
  );
}
