import type { GeoResult } from "@/lib/providers/types";

/**
 * The address a signed-out visitor picked before being sent to Google sign-in.
 *
 * The OAuth round trip leaves the page, so the choice is kept in this tab's
 * sessionStorage and picked up when the map mounts again. It holds only the
 * public geocoder result (address, locality, coordinates), never anything from
 * the session, and it expires so a stale choice doesn't reopen days later.
 */
export const PENDING_ADDRESS_KEY = "forleads.pendingAddress";
export const PENDING_ADDRESS_TTL_MS = 30 * 60 * 1000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface StoredPending {
  target: GeoResult;
  savedAt: number;
}

function sessionStore(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // storage blocked (privacy mode, sandboxed frame)
  }
}

function isGeoResult(value: unknown): value is GeoResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.address === "string" &&
    v.address.trim() !== "" &&
    v.address.length <= 300 &&
    typeof v.lng === "number" &&
    Number.isFinite(v.lng) &&
    Math.abs(v.lng) <= 180 &&
    typeof v.lat === "number" &&
    Number.isFinite(v.lat) &&
    Math.abs(v.lat) <= 90 &&
    (v.locality === undefined || typeof v.locality === "string")
  );
}

export function savePendingAddress(
  target: GeoResult,
  store: StorageLike | null = sessionStore(),
  now = Date.now()
): void {
  if (!store) return;
  const value: StoredPending = {
    target: {
      address: target.address,
      locality: target.locality,
      lng: target.lng,
      lat: target.lat,
    },
    savedAt: now,
  };
  try {
    store.setItem(PENDING_ADDRESS_KEY, JSON.stringify(value));
  } catch {
    // Quota or blocked storage: sign-in still works, the address just won't resume.
  }
}

/** The saved address, or null if none, malformed or older than the TTL. */
export function readPendingAddress(
  store: StorageLike | null = sessionStore(),
  now = Date.now()
): GeoResult | null {
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(PENDING_ADDRESS_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPending>;
    const fresh =
      typeof parsed.savedAt === "number" &&
      now - parsed.savedAt >= 0 &&
      now - parsed.savedAt <= PENDING_ADDRESS_TTL_MS;
    if (fresh && isGeoResult(parsed.target)) return parsed.target;
  } catch {
    // fall through and clear the bad value
  }
  clearPendingAddress(store);
  return null;
}

export function clearPendingAddress(store: StorageLike | null = sessionStore()): void {
  try {
    store?.removeItem(PENDING_ADDRESS_KEY);
  } catch {
    // ignore
  }
}
