#!/usr/bin/env node
// ============================================================================
// Catalog source scout. Finds and probes open-data candidates BEFORE they are
// added to src/lib/providers/catalog.ts — every catalog entry must be
// live-verified with a real row first (see .agent/playbook.md recipe).
//
//   node scripts/catalog-probe.mjs discover <portal-domain> "<query>"
//   node scripts/catalog-probe.mjs probe <dataset-json-url>
//
// discover: lists matching datasets on a Socrata portal (id, name, updated).
// probe: fetches one row and prints the field names + sample values so the
// cfg mapping (address/amount/date/label) can be chosen from evidence.
// ============================================================================

const UA = "Forleads/1.0 (open-data real-estate CRM; +https://forleads.vercel.app)";

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json();
}

const [, , cmd, a, b] = process.argv;

if (cmd === "discover") {
  const url = `https://api.us.socrata.com/api/catalog/v1?domains=${encodeURIComponent(a)}&q=${encodeURIComponent(b ?? "")}&limit=8&only=dataset`;
  const data = await getJson(url);
  for (const r of data.results ?? []) {
    const res = r.resource;
    console.log(`${res.id}  ${String(res.updatedAt).slice(0, 10)}  ${res.name}`);
  }
} else if (cmd === "probe") {
  const sep = a.includes("?") ? "&" : "?";
  const rows = await getJson(`${a}${sep}$limit=1`);
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) {
    console.log("NO ROWS");
    process.exit(1);
  }
  for (const [k, v] of Object.entries(row)) {
    console.log(`${k} = ${JSON.stringify(v).slice(0, 80)}`);
  }
} else {
  console.log("usage: catalog-probe.mjs discover <domain> <query> | probe <dataset-json-url>");
  process.exit(1);
}
