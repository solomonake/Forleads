import { contactabilityPassport } from "@/lib/contacts/contactability";
import type { LeadStatus, LeadSurface } from "@/lib/core/types";

export interface FarmImportRow {
  address: string;
  locality?: string;
  lng?: number;
  lat?: number;
}

export interface FarmRow {
  id?: string;
  address: string;
  locality?: string;
  lng?: number;
  lat?: number;
  status?: LeadStatus;
  contactName?: string;
  contactEmail?: string;
  contactability?: ReturnType<typeof contactabilityPassport>["summary"];
}

export interface ParseFarmCsvResult {
  rows: FarmImportRow[];
  skipped: number;
  needsGeocode: number;
}

const EXPORT_HEADER =
  "address,locality,lng,lat,status,contact_name,contact_email,contactability";

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === "\"" && line[i + 1] === "\"") {
        current += "\"";
        i++;
      } else if (ch === "\"") {
        quoted = false;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === "\"") {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function csvCell(value: string | number | undefined): string {
  if (value === undefined || value === "") return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll("\"", "\"\"")}"`;
  return text;
}

function num(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function parseFarmCsv(input: string): ParseFarmCsvResult {
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { rows: [], skipped: 0, needsGeocode: 0 };

  const header = splitCsvLine(lines[0] ?? "").map((h) => h.toLowerCase().replaceAll(" ", "_"));
  const idx = (name: string) => header.indexOf(name);
  const addressIdx = idx("address");
  const localityIdx = idx("locality");
  const lngIdx = idx("lng") >= 0 ? idx("lng") : idx("lon");
  const latIdx = idx("lat");

  const rows: FarmImportRow[] = [];
  let skipped = 0;
  let needsGeocode = 0;

  for (const line of lines.slice(addressIdx >= 0 ? 1 : 0)) {
    const cells = splitCsvLine(line);
    const address = (addressIdx >= 0 ? cells[addressIdx] : cells[0])?.trim();
    if (!address) {
      skipped += 1;
      continue;
    }
    const lng = num(lngIdx >= 0 ? cells[lngIdx] : undefined);
    const lat = num(latIdx >= 0 ? cells[latIdx] : undefined);
    if (lng === undefined || lat === undefined) needsGeocode += 1;
    rows.push({
      address,
      locality: (localityIdx >= 0 ? cells[localityIdx] : undefined) || undefined,
      lng,
      lat,
    });
  }

  return { rows, skipped, needsGeocode };
}

export function exportFarmCsv(rows: FarmRow[]): string {
  const body = rows.map((row) =>
    [
      csvCell(row.address),
      csvCell(row.locality),
      csvCell(row.lng),
      csvCell(row.lat),
      csvCell(row.status),
      csvCell(row.contactName),
      csvCell(row.contactEmail),
      csvCell(row.contactability),
    ].join(","),
  );
  return [EXPORT_HEADER, ...body].join("\n") + "\n";
}

export function filterFarmRows(
  rows: FarmRow[],
  opts: { q?: string; status?: LeadStatus | "all" },
): FarmRow[] {
  const q = opts.q?.trim().toLowerCase();
  return rows.filter((row) => {
    if (opts.status && opts.status !== "all" && row.status !== opts.status) return false;
    if (!q) return true;
    const hay = [row.address, row.locality, row.contactName, row.contactEmail]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function rowsFromLeads(leads: LeadSurface[]): FarmRow[] {
  return leads.map((lead) => {
    const passport = contactabilityPassport(lead.contact);
    return {
      id: lead.id,
      address: lead.address,
      locality: lead.locality,
      lng: lead.lng,
      lat: lead.lat,
      status: lead.status,
      contactName: lead.contact?.name,
      contactEmail: lead.contact?.email,
      contactability: passport.summary,
    };
  });
}
