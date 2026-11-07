// Shared by the browser typeahead and /api/geocode so both agree on what a
// query is and when it's long enough to send.

/** Characters before suggestions are requested. */
export const MIN_GEOCODE_QUERY = 3;
export const MAX_GEOCODE_QUERY = 200;

/** Trim, collapse whitespace and cap length. */
export function normalizeGeocodeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().slice(0, MAX_GEOCODE_QUERY);
}
