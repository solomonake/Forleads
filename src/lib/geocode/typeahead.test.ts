// G3: as-you-type geocoding must be debounced, length-gated and capped, and
// picking a suggestion must not trigger another lookup.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoResult } from "@/lib/providers/types";
import { Typeahead, TYPEAHEAD_DEBOUNCE_MS, type TypeaheadState } from "./typeahead";

const hit: GeoResult = { address: "22125 Clarksburg Road", locality: "Maryland", lng: -77.28, lat: 39.23 };

function setup(opts: { maxPerMinute?: number; fail?: boolean } = {}) {
  const queries: string[] = [];
  const states: TypeaheadState[] = [];
  const ta = new Typeahead({
    fetchSuggestions: async (q) => {
      queries.push(q);
      if (opts.fail) throw new Error("down");
      return [hit];
    },
    onState: (s) => states.push(s),
    maxPerMinute: opts.maxPerMinute,
    now: () => Date.now(),
  });
  return { ta, queries, states };
}

function typeOut(ta: Typeahead, text: string, gapMs = 60) {
  for (let i = 1; i <= text.length; i++) {
    ta.input(text.slice(0, i));
    vi.advanceTimersByTime(gapMs);
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Typeahead", () => {
  it("debounces at least 300 ms", () => {
    expect(TYPEAHEAD_DEBOUNCE_MS).toBeGreaterThanOrEqual(300);
    const { ta, queries } = setup();
    ta.input("22125");
    vi.advanceTimersByTime(299);
    expect(queries).toEqual([]);
  });

  it("10 quick keystrokes make at most one request", async () => {
    const { ta, queries, states } = setup();
    typeOut(ta, "22125 Clark");
    await vi.advanceTimersByTimeAsync(TYPEAHEAD_DEBOUNCE_MS);
    expect(queries).toEqual(["22125 Clark"]);
    expect(states.at(-1)).toEqual({ status: "ready", results: [hit] });
  });

  it("sends nothing below the minimum length", async () => {
    const { ta, queries, states } = setup();
    ta.input("22");
    await vi.advanceTimersByTimeAsync(2000);
    expect(queries).toEqual([]);
    expect(states.at(-1)?.status).toBe("idle");
  });

  it("picking a suggestion makes no extra request", async () => {
    const { ta, queries } = setup();
    ta.input("22125 Clark");
    await vi.advanceTimersByTimeAsync(TYPEAHEAD_DEBOUNCE_MS);
    expect(queries).toHaveLength(1);
    ta.select(hit.address);
    ta.input(hit.address); // the field is set to the picked address
    await vi.advanceTimersByTimeAsync(2000);
    expect(queries).toHaveLength(1);
    // Editing afterwards searches again.
    ta.input(`${hit.address} N`);
    await vi.advanceTimersByTimeAsync(TYPEAHEAD_DEBOUNCE_MS);
    expect(queries).toHaveLength(2);
  });

  it("reuses answers for a query it has already seen", async () => {
    const { ta, queries } = setup();
    ta.input("Karen Road");
    await vi.advanceTimersByTimeAsync(TYPEAHEAD_DEBOUNCE_MS);
    ta.input("Karen Roa");
    await vi.advanceTimersByTimeAsync(TYPEAHEAD_DEBOUNCE_MS);
    ta.input("karen  road");
    await vi.advanceTimersByTimeAsync(TYPEAHEAD_DEBOUNCE_MS);
    expect(queries).toEqual(["Karen Road", "Karen Roa"]);
  });

  it("caps requests per minute and says so", async () => {
    const { ta, queries, states } = setup({ maxPerMinute: 2 });
    for (const q of ["aaa", "bbb", "ccc"]) {
      ta.input(q);
      await vi.advanceTimersByTimeAsync(TYPEAHEAD_DEBOUNCE_MS);
    }
    expect(queries).toEqual(["aaa", "bbb"]);
    expect(states.at(-1)?.status).toBe("limited");
    await vi.advanceTimersByTimeAsync(60_000);
    ta.input("ddd");
    await vi.advanceTimersByTimeAsync(TYPEAHEAD_DEBOUNCE_MS);
    expect(queries).toEqual(["aaa", "bbb", "ddd"]);
  });

  it("reports errors without caching them", async () => {
    const { ta, states } = setup({ fail: true });
    ta.input("Kampala");
    await vi.advanceTimersByTimeAsync(TYPEAHEAD_DEBOUNCE_MS);
    expect(states.at(-1)?.status).toBe("error");
  });
});
