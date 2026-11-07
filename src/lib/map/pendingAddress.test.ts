import { describe, expect, it } from "vitest";
import {
  PENDING_ADDRESS_KEY,
  PENDING_ADDRESS_TTL_MS,
  clearPendingAddress,
  readPendingAddress,
  savePendingAddress,
} from "./pendingAddress";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const target = { address: "22125 Clarksburg Rd", locality: "Maryland, USA", lng: -77.28, lat: 39.23 };

describe("pending address across the sign-in round trip", () => {
  it("round-trips the chosen address within the TTL", () => {
    const store = memoryStore();
    savePendingAddress(target, store, 1_000);
    expect(readPendingAddress(store, 1_000 + 60_000)).toEqual(target);
  });

  it("keeps only the public geocoder fields", () => {
    const store = memoryStore();
    savePendingAddress({ ...target, ...{ email: "x@example.com" } } as typeof target, store, 0);
    expect(store.data.get(PENDING_ADDRESS_KEY)).not.toContain("example.com");
  });

  it("expires after the TTL and clears the stale value", () => {
    const store = memoryStore();
    savePendingAddress(target, store, 0);
    expect(readPendingAddress(store, PENDING_ADDRESS_TTL_MS + 1)).toBeNull();
    expect(store.data.has(PENDING_ADDRESS_KEY)).toBe(false);
  });

  it("rejects malformed or out-of-range values", () => {
    const store = memoryStore();
    store.setItem(PENDING_ADDRESS_KEY, "{not json");
    expect(readPendingAddress(store, 0)).toBeNull();
    store.setItem(
      PENDING_ADDRESS_KEY,
      JSON.stringify({ target: { ...target, lat: 200 }, savedAt: 0 })
    );
    expect(readPendingAddress(store, 0)).toBeNull();
  });

  it("clears on demand and tolerates missing storage", () => {
    const store = memoryStore();
    savePendingAddress(target, store, 0);
    clearPendingAddress(store);
    expect(readPendingAddress(store, 0)).toBeNull();
    expect(readPendingAddress(null)).toBeNull();
    expect(() => savePendingAddress(target, null)).not.toThrow();
  });
});
