"use client";

import { useMemo, useRef, useState } from "react";
import type { LeadStatus, LeadSurface } from "@/lib/core/types";
import { contactabilityPassport } from "@/lib/contacts/contactability";
import { exportFarmCsv, filterFarmRows, parseFarmCsv, rowsFromLeads } from "@/lib/farm/csv";
import type { GeoResult } from "@/lib/providers/types";
import { apiGet, apiPost } from "./api";

const STATUSES: Array<LeadStatus | "all"> = [
  "all",
  "new",
  "researching",
  "contacted",
  "nurturing",
  "appointment",
  "won",
  "dead",
];

const IMPORT_CAP = 50;

export function FarmTable({
  leads,
  onOpenLead,
  onImported,
}: {
  leads: LeadSurface[];
  onOpenLead: (lead: LeadSurface) => void;
  onImported: () => Promise<void> | void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () => filterFarmRows(rowsFromLeads(leads), { q, status }),
    [leads, q, status],
  );

  const download = () => {
    const blob = new Blob([exportFarmCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "forleads-farm.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    setBusy(true);
    setNotice(null);
    try {
      const parsed = parseFarmCsv(await file.text());
      const slice = parsed.rows.slice(0, IMPORT_CAP);
      let created = 0;
      let failed = 0;
      let unresolved = 0;
      for (const row of slice) {
        let lng = row.lng;
        let lat = row.lat;
        let locality = row.locality;
        let address = row.address;
        if (lng === undefined || lat === undefined) {
          const geo = await apiGet<{ results: GeoResult[] }>(
            `/api/geocode?q=${encodeURIComponent(row.address)}`,
          );
          const hit = geo.results[0];
          if (!hit) {
            unresolved += 1;
            continue;
          }
          lng = hit.lng;
          lat = hit.lat;
          locality = locality ?? hit.locality;
          address = hit.address || address;
        }
        try {
          await apiPost("/api/lead", { address, lng, lat, locality });
          created += 1;
        } catch {
          failed += 1;
        }
      }
      const extra = parsed.rows.length > IMPORT_CAP
        ? ` Stopped at ${IMPORT_CAP} rows.`
        : "";
      setNotice(
        `Imported ${created}. Unresolved ${unresolved}. Failed ${failed}. Skipped blanks ${parsed.skipped}.${extra}`,
      );
      await onImported();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't read that CSV.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="farm">
      <div className="farm-toolbar">
        <input
          className="farm-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter address or contact"
          aria-label="Filter farm"
        />
        <select
          className="farm-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as LeadStatus | "all")}
          aria-label="Filter status"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s}
            </option>
          ))}
        </select>
        <button className="minibtn" type="button" onClick={download} disabled={rows.length === 0}>
          Export CSV
        </button>
        <button className="minibtn" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "Importing…" : "Import CSV"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
          }}
        />
      </div>
      {notice && <div className="row notice-row">{notice}</div>}
      {rows.length === 0 ? (
        <p className="farm-empty">No rows. Ground an address on the map or import a CSV with an address column.</p>
      ) : (
        <div className="farm-scroll">
          <table className="farm-table" data-testid="farm-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Locality</th>
                <th>Status</th>
                <th>Contact</th>
                <th>Reach</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const lead = leads.find((l) => l.id === row.id);
                if (!lead) return null;
                const passport = contactabilityPassport(lead.contact);
                return (
                  <tr key={lead.id}>
                    <td>
                      <button className="farm-addr" type="button" onClick={() => onOpenLead(lead)}>
                        {lead.address}
                      </button>
                    </td>
                    <td>{lead.locality ?? "—"}</td>
                    <td>{lead.status}</td>
                    <td>{lead.contact?.name ?? "—"}</td>
                    <td>{passport.summary.replaceAll("_", " ")}</td>
                    <td>
                      <button className="minibtn" type="button" onClick={() => onOpenLead(lead)}>
                        Map
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
