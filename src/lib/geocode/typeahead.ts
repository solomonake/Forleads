// Browser-side address typeahead: decides WHEN /api/geocode is called.
//
// - waits for a pause in typing (debounce ≥300 ms) and a minimum length;
// - remembers answers for this tab, so retyping or backspacing doesn't refetch;
// - caps requests per minute per tab (the server caps per IP as well);
// - ignores the query change caused by picking a suggestion, which used to
//   fire a second, wasted geocode for the selected text.
import type { GeoResult } from "@/lib/providers/types";
import { MIN_GEOCODE_QUERY, normalizeGeocodeQuery } from "./query";

export const TYPEAHEAD_DEBOUNCE_MS = 350;
export const TYPEAHEAD_MAX_PER_MINUTE = 30;
const MEMO_LIMIT = 60;

export type TypeaheadStatus = "idle" | "loading" | "ready" | "empty" | "error" | "limited";

export interface TypeaheadState {
  status: TypeaheadStatus;
  results: GeoResult[];
}

export interface TypeaheadOptions {
  fetchSuggestions: (query: string, signal: AbortSignal) => Promise<GeoResult[]>;
  onState: (state: TypeaheadState) => void;
  debounceMs?: number;
  minLength?: number;
  maxPerMinute?: number;
  now?: () => number;
}

export class Typeahead {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: AbortController | null = null;
  private memo = new Map<string, GeoResult[]>();
  private sent: number[] = [];
  private selected: string | null = null;
  private readonly debounceMs: number;
  private readonly minLength: number;
  private readonly maxPerMinute: number;
  private readonly now: () => number;

  constructor(private opts: TypeaheadOptions) {
    this.debounceMs = Math.max(300, opts.debounceMs ?? TYPEAHEAD_DEBOUNCE_MS);
    this.minLength = opts.minLength ?? MIN_GEOCODE_QUERY;
    this.maxPerMinute = opts.maxPerMinute ?? TYPEAHEAD_MAX_PER_MINUTE;
    this.now = opts.now ?? Date.now;
  }

  /** The text field changed to `raw`. */
  input(raw: string): void {
    this.cancel();
    const query = normalizeGeocodeQuery(raw);
    if (this.selected !== null && query === this.selected) {
      // The field was set to a picked suggestion; nothing to look up.
      return;
    }
    this.selected = null;
    if (query.length < this.minLength) {
      this.opts.onState({ status: "idle", results: [] });
      return;
    }
    const memoKey = query.toLowerCase();
    const known = this.memo.get(memoKey);
    if (known) {
      this.opts.onState({ status: known.length ? "ready" : "empty", results: known });
      return;
    }
    this.opts.onState({ status: "loading", results: [] });
    this.timer = setTimeout(() => void this.fetch(query, memoKey), this.debounceMs);
  }

  /** A suggestion was picked; the next input() with this text is not a search. */
  select(address: string): void {
    this.cancel();
    this.selected = normalizeGeocodeQuery(address);
  }

  dispose(): void {
    this.cancel();
  }

  private cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.inflight?.abort();
    this.inflight = null;
  }

  private async fetch(query: string, memoKey: string): Promise<void> {
    const now = this.now();
    this.sent = this.sent.filter((t) => now - t < 60_000);
    if (this.sent.length >= this.maxPerMinute) {
      this.opts.onState({ status: "limited", results: [] });
      return;
    }
    this.sent.push(now);
    const controller = new AbortController();
    this.inflight = controller;
    try {
      const results = await this.opts.fetchSuggestions(query, controller.signal);
      if (controller.signal.aborted) return;
      if (this.memo.size >= MEMO_LIMIT) this.memo.delete(this.memo.keys().next().value as string);
      this.memo.set(memoKey, results);
      this.opts.onState({ status: results.length ? "ready" : "empty", results });
    } catch {
      if (controller.signal.aborted) return;
      this.opts.onState({ status: "error", results: [] });
    } finally {
      if (this.inflight === controller) this.inflight = null;
    }
  }
}
