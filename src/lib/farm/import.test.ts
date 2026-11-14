import { describe, expect, it } from "vitest";
import { continueImport, importSummary, startImport, type ImportServices } from "./import";
import type { FarmImportRow } from "./csv";

const rows = (n: number, coordinates = false): FarmImportRow[] => Array.from({ length: n }, (_, i) => ({ address: `Synthetic ${i}`, ...(coordinates ? { lng: 0, lat: 0 } : {}) }));
function fixture(n: number, coordinates = false) {
  let clock = 1000, gets = 0, refreshes = 0;
  const writes: string[] = [];
  const state = startImport({ rows: rows(n, coordinates), skipped: 2, needsGeocode: coordinates ? 0 : n });
  const api: ImportServices = {
    now: () => clock,
    geocode: async (address) => { gets++; return [{ address, lng: 0, lat: 0 }]; },
    create: async (row) => { writes.push(row.address); },
    refresh: async () => { refreshes++; },
  };
  return { state, api, writes, advance: () => { clock += 61_000; }, gets: () => gets, refreshes: () => refreshes };
}
describe("Farm import recovery", () => {
  it("retains progress on malformed successful geocode replies", async () => {
    const f = fixture(3); const read = f.api.geocode; let n = 0;
    f.api.geocode = async a => ++n === 3 ? null as never : read(a);
    const p = await continueImport(f.state, f.api);
    expect(p).toMatchObject({ imported: 2, next: 2 }); expect(f.refreshes()).toBe(1);
    const done = await continueImport(p, f.api); expect(done.imported).toBe(3); expect(f.writes).toHaveLength(3);
  });
  it("refreshes 40 confirmed saves after a geocode throttle and resumes only remaining rows", async () => {
    const f = fixture(50); const read = f.api.geocode;
    let count = 0;
    f.api.geocode = async (address) => { if (++count === 41) throw { status: 429, retryAfterSeconds: 60 }; return read(address); };
    const paused = await continueImport(f.state, f.api);
    expect(paused).toMatchObject({ imported: 40, next: 40, retryAt: 61000 });
    expect(f.refreshes()).toBe(1);
    expect(importSummary(paused)).toContain("Remaining 10");
    expect(await continueImport(paused, f.api)).toEqual(paused);
    expect(count).toBe(41);
    f.advance(); const done = await continueImport(paused, f.api);
    expect(done.imported).toBe(50); expect(new Set(f.writes).size).toBe(50); expect(f.writes).toHaveLength(50);
  });
  it("keeps progress on row-3 read failure and safely retries the read", async () => {
    const f = fixture(5); const read = f.api.geocode; let n = 0;
    f.api.geocode = async a => { if (++n === 3) throw new Error("offline"); return read(a); };
    const p = await continueImport(f.state, f.api);
    expect(p).toMatchObject({ next: 2, imported: 2 }); expect(f.refreshes()).toBe(1);
    const done = await continueImport(p, f.api); expect(done.imported).toBe(5); expect(f.writes).toHaveLength(5);
  });
  it("resumes a rejected create without repeating geocode or confirmed writes", async () => {
    const f = fixture(3); const write = f.api.create; let n = 0;
    f.api.create = async row => { if (++n === 2) throw { status: 429 }; return write(row); };
    const p = await continueImport(f.state, f.api); expect(p.next).toBe(1);
    f.advance(); const done = await continueImport(p, f.api);
    expect(done.imported).toBe(3); expect(f.gets()).toBe(3); expect(f.writes).toHaveLength(3);
  });
  it("does not replay an uncertain write, including after resuming", async () => {
    const f = fixture(3, true); const write = f.api.create; let n = 0;
    f.api.create = async row => { await write(row); if (++n === 2) throw new Error("response lost after save"); };
    const p = await continueImport(f.state, f.api);
    expect(p).toMatchObject({ imported: 1, uncertain: 1, next: 2 }); expect(f.refreshes()).toBe(1);
    const done = await continueImport(p, f.api);
    expect(done).toMatchObject({ imported: 2, uncertain: 1, next: 3 }); expect(f.writes).toHaveLength(3); expect(importSummary(done)).toContain("Synthetic 1");
  });
  it("caps at 50 and never geocodes coordinate-complete rows", async () => {
    const f = fixture(51, true); const p = await continueImport(f.state, f.api);
    expect(p).toMatchObject({ imported: 50, omitted: 1, next: 50, skipped: 2 }); expect(f.gets()).toBe(0); expect(f.refreshes()).toBe(1);
  });
  it("skips missing and ambiguous candidates without writing invented matches", async () => {
    const f = fixture(2); let n = 0;
    f.api.geocode = async address => ++n === 1 ? [] : [{ address, lng: 0, lat: 0 }, { address: 'other', lng: 1, lat: 1 }];
    const p = await continueImport(f.state, f.api); expect(p.unresolved).toBe(2); expect(f.writes).toHaveLength(0);
  });
  it("retains counts when refresh fails and reports the verification gap", async () => {
    const f = fixture(2, true); f.api.refresh = async () => { throw new Error('offline'); };
    const p = await continueImport(f.state, f.api); expect(p.imported).toBe(2); expect(importSummary(p)).toContain("Couldn't refresh");
  });
  it("preserves the current row on an authentication rejection", async () => {
    const f = fixture(2, true); f.api.create = async () => { throw { status: 401 }; };
    const p = await continueImport(f.state, f.api); expect(p).toMatchObject({ next: 0, imported: 0, uncertain: 0 }); expect(p.message).toContain('Sign in');
  });
});
