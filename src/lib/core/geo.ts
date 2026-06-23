// ============================================================================
// Lightweight geo helpers. We avoid a heavy h3-js dependency for the local
// build and emulate H3 cell keys with a deterministic resolution grid — same
// purpose: a stable spatial cache/aggregation key per area
// (docs/Forleads_MapGIS_v1.md §4). Swap in h3-js when wiring PostGIS.
// ============================================================================

/** Approximate H3-style cell key at ~res 10 (≈ 65m edge). Deterministic. */
export function h3Key(lng: number, lat: number, res = 10): string {
  // grid size shrinks with resolution; res 10 ~ 0.0007 deg cells.
  const cell = 0.0007 * Math.pow(2, 9 - res);
  const gx = Math.round(lng / cell);
  const gy = Math.round(lat / cell);
  return `h3r${res}_${gx}_${gy}`;
}

/** Normalize an address string into a cache key. */
export function addressKey(address: string): string {
  return address.toLowerCase().replace(/\s+/g, " ").trim();
}

const R = 6371000; // earth radius, meters

/** Haversine distance in meters. */
export function distanceMeters(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number }
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
