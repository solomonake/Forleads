import type { FarmImportRow, ParseFarmCsvResult } from "./csv";
import type { GeoResult } from "@/lib/providers/types";

export const IMPORT_CAP = 50;
export interface ImportProgress {
  rows: FarmImportRow[];
  next: number;
  imported: number;
  unresolved: number;
  uncertain: number;
  uncertainAddresses: string[];
  skipped: number;
  omitted: number;
  retryAt: number;
  message?: string;
}
export interface ImportServices {
  geocode(address: string): Promise<GeoResult[]>;
  create(row: FarmImportRow & { lng: number; lat: number }): Promise<unknown>;
  refresh(): Promise<void> | void;
  now(): number;
}
export function startImport(parsed: ParseFarmCsvResult): ImportProgress {
  return { rows: parsed.rows.slice(0, IMPORT_CAP), next: 0, imported: 0,
    unresolved: 0, uncertain: 0, uncertainAddresses: [], skipped: parsed.skipped,
    omitted: Math.max(0, parsed.rows.length - IMPORT_CAP), retryAt: 0 };
}
function retrySeconds(error: unknown): number {
  const seconds = (error as { retryAfterSeconds?: number } | null)?.retryAfterSeconds;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0
    ? Math.min(seconds, 86400) : 60;
}
function status(error: unknown): number | undefined {
  return (error as { status?: number } | null)?.status;
}
export function importSummary(p: ImportProgress): string {
  return `Imported ${p.imported}. Unresolved ${p.unresolved}. Uncertain ${p.uncertain}. Remaining ${p.rows.length - p.next}. Skipped blanks ${p.skipped}.` +
    (p.omitted ? ` ${p.omitted} rows beyond the ${IMPORT_CAP}-row limit were not processed.` : "") +
    (p.uncertainAddresses.length ? ` Check unconfirmed saves: ${p.uncertainAddresses.join("; ")}. These rows will not be retried.` : "") +
    (p.message ? ` ${p.message}` : "");
}

// Only explicit Resume may retry a known rejected write or a read. A network/
// server failure on POST may have persisted, so consume it as uncertain.
export async function continueImport(previous: ImportProgress, api: ImportServices): Promise<ImportProgress> {
  const p = { ...previous };
  if (api.now() < p.retryAt) return p;
  p.message = undefined;
  p.retryAt = 0;
  try {
    while (p.next < p.rows.length) {
      let row = { ...p.rows[p.next]! };
      if (row.lng === undefined || row.lat === undefined) {
        let hits: GeoResult[];
        try {
          hits = await api.geocode(row.address);
          if (!Array.isArray(hits)) throw new Error("Invalid address lookup response");
        }
        catch (error) {
          p.retryAt = api.now() + (status(error) === 429 ? retrySeconds(error) * 1000 : 0);
          p.message = status(error) === 429
            ? "Address lookup is rate limited. Wait for the countdown, then resume."
            : "Address lookup failed. Resume to retry this address.";
          break;
        }
        // A suggestion is not an exact property match. Avoid silently choosing
        // among candidates, and leave unresolved rows for manual correction.
        if (hits.length !== 1 || !hits[0] || !Number.isFinite(hits[0]?.lng) || !Number.isFinite(hits[0]?.lat)) {
          p.unresolved++; p.next++; continue;
        }
        const hit = hits[0]!;
        row = { ...row, address: hit.address || row.address, lng: hit.lng, lat: hit.lat,
          locality: row.locality ?? hit.locality };
        // Keep the resolved coordinates for a later create-throttle resume.
        p.rows = [...p.rows]; p.rows[p.next] = row;
      }
      try {
        await api.create(row as FarmImportRow & { lng: number; lat: number });
        p.imported++; p.next++;
      } catch (error) {
        if (status(error) === 429 || status(error) === 401 || (error as { code?: string } | null)?.code === "import_account_changed") {
          p.retryAt = api.now() + (status(error) === 429 ? retrySeconds(error) * 1000 : 0);
          p.message = status(error) === 429
            ? "Lead creation is rate limited. Wait for the countdown, then resume."
            : error instanceof Error ? error.message : "Sign in before resuming. No further rows were attempted.";
        } else {
          p.uncertain++; p.uncertainAddresses = [...p.uncertainAddresses, row.address]; p.next++;
          p.message = `The save for ${row.address} could not be confirmed. Check the farm before importing it again. Resume skips this uncertain row.`;
        }
        break;
      }
    }
  } finally {
    try { await api.refresh(); }
    catch { p.message = `${p.message ? p.message + " " : ""}Couldn't refresh the farm. Reload to check saved rows; counts above are retained.`; }
  }
  return p;
}
