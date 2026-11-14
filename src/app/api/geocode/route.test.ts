// G3 (audit 2026-11-07): production ran search-as-you-type against public
// Nominatim with no cache or limit, which its usage policy forbids.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const headersSeen: Record<string, string>[] = [];
let upstreamStatus = 200;

function photonBody() {
  return {
    features: [
      {
        geometry: { coordinates: [-77.28, 39.23] },
        properties: { housenumber: "22125", street: "Clarksburg Road", city: "Clarksburg", state: "Maryland", country: "United States" },
      },
    ],
  };
}

function nominatimBody() {
  return [
    {
      lon: "-77.28",
      lat: "39.23",
      display_name: "22125, Clarksburg Road, Clarksburg, Maryland, United States",
      address: { house_number: "22125", road: "Clarksburg Road", town: "Clarksburg", state: "Maryland", country: "United States" },
    },
  ];
}

async function loadRoute(geocoder: string) {
  vi.resetModules();
  process.env.FORLEADS_GEOCODER = geocoder;
  delete (globalThis as { __forleadsGeocodeCache?: unknown }).__forleadsGeocodeCache;
  return import("./route");
}

let ipCounter = 0;
function req(q: string, opts: { resolve?: boolean; ip?: string } = {}) {
  const url = `http://localhost/api/geocode?q=${encodeURIComponent(q)}${opts.resolve ? "&resolve=1" : ""}`;
  const r = new Request(url, { headers: { "x-forwarded-for": opts.ip ?? `10.1.0.${++ipCounter}` } });
  return Object.assign(r, { nextUrl: new URL(url) }) as never;
}

beforeEach(() => {
  calls.length = 0;
  headersSeen.length = 0;
  upstreamStatus = 200;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    headersSeen.push({ ...(init?.headers as Record<string, string>) });
    if (upstreamStatus !== 200) return new Response("busy", { status: upstreamStatus });
    const body = url.includes("nominatim") ? nominatimBody() : photonBody();
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

afterEach(() => {
  delete process.env.FORLEADS_GEOCODER;
});

describe("GET /api/geocode (public providers)", () => {
  it("sends suggestions to Photon, never to Nominatim, with identifying headers", async () => {
    const { GET } = await loadRoute("photon");
    const res = await GET(req("22125 Clarksburg"));
    const body = (await res.json()) as { results: { address: string; locality: string }[]; provider: string };
    expect(res.status).toBe(200);
    expect(body.provider).toBe("photon");
    expect(body.results[0]).toMatchObject({ address: "22125 Clarksburg Road", locality: "Clarksburg, Maryland, United States" });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!).host).toBe("photon.komoot.io");
    expect(headersSeen[0]!["User-Agent"]).toMatch(/^Forleads\/1\.0 .*forleads\.vercel\.app/);
    expect(headersSeen[0]!["User-Agent"]).not.toMatch(/@/);
    expect(headersSeen[0]!.Referer).toBe("https://forleads.vercel.app/");
  });

  it("the legacy FORLEADS_GEOCODER=nominatim value also suggests via Photon", async () => {
    const { GET } = await loadRoute("nominatim");
    await GET(req("22125 Clarksburg"));
    expect(calls.map((u) => new URL(u).host)).toEqual(["photon.komoot.io"]);
  });

  it("caches results: a repeat (any case or spacing) makes no upstream call", async () => {
    const { GET } = await loadRoute("photon");
    const ip = "10.2.0.1";
    expect((await GET(req("22125 Clarksburg", { ip }))).headers.get("x-geocode-cache")).toBe("miss");
    const again = await GET(req("  22125   CLARKSBURG ", { ip }));
    expect(again.headers.get("x-geocode-cache")).toBe("hit");
    expect(calls).toHaveLength(1);
  });

  it("never sends queries shorter than the minimum upstream", async () => {
    const { GET } = await loadRoute("photon");
    for (const q of ["", "2", "22", "  2 "]) {
      const res = await GET(req(q));
      expect(((await res.json()) as { results: unknown[] }).results).toEqual([]);
    }
    expect(calls).toHaveLength(0);
  });

  it("rate limits a burst from one client with 429", async () => {
    const { GET, SUGGEST_PER_IP_PER_MIN } = await loadRoute("photon");
    const ip = "10.3.0.1";
    const statuses: number[] = [];
    for (let i = 0; i <= SUGGEST_PER_IP_PER_MIN; i++) {
      statuses.push((await GET(req(`street number ${i}`, { ip }))).status);
    }
    expect(statuses.slice(0, SUGGEST_PER_IP_PER_MIN).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    expect(calls).toHaveLength(SUGGEST_PER_IP_PER_MIN);
  });

  it("resolves an explicit lookup with one Nominatim call, then serves it from cache", async () => {
    const { GET } = await loadRoute("photon");
    const ip = "10.4.0.1";
    const res = await GET(req("22125 Clarksburg Rd", { resolve: true, ip }));
    const body = (await res.json()) as { result: { address: string } };
    expect(body.result.address).toBe("22125 Clarksburg Road");
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!);
    expect(url.host).toBe("nominatim.openstreetmap.org");
    expect(url.searchParams.get("limit")).toBe("1");
    await GET(req("22125 clarksburg rd", { resolve: true, ip }));
    expect(calls).toHaveLength(1);
  });

  it("reports an upstream failure as 502 and does not cache it", async () => {
    const { GET } = await loadRoute("photon");
    const ip = "10.5.0.1";
    upstreamStatus = 503;
    expect((await GET(req("Karen Road", { ip }))).status).toBe(502);
    upstreamStatus = 200;
    expect((await GET(req("Karen Road", { ip }))).status).toBe(200);
    expect(calls).toHaveLength(2);
  });
});
