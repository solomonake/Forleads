"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LeadStatus, LeadSurface } from "@/lib/core/types";
import { contactabilityPassport } from "@/lib/contacts/contactability";
import { exportFarmCsv, filterFarmRows, parseFarmCsv, rowsFromLeads } from "@/lib/farm/csv";
import type { GeoResult } from "@/lib/providers/types";
import { apiGet, apiPost, ApiError } from "./api";

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

import { continueImport, importSummary, startImport, type ImportProgress } from "@/lib/farm/import";

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
  const running = useRef(false);
  const importUser = useRef<string | null | undefined>(undefined);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!progress || progress.retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [progress]);
  const waiting = progress ? Math.max(0, Math.ceil((progress.retryAt - now) / 1000)) : 0;

  const verifyAccount = async () => {
    const session = await apiGet<{ user: { sub: string } | null }>("/api/auth/session");
    const user = session.user?.sub ?? null;
    if (importUser.current === undefined) importUser.current = user;
    if (importUser.current !== user) {
      throw new ApiError("The signed-in account changed. Return to the original account or discard remaining rows.", 401, undefined, "import_account_changed");
    }
  };
  const runImport = async (state: ImportProgress) => {
    await verifyAccount();
    const result = await continueImport(state, {
      geocode: async (address) => (await apiGet<{ results: GeoResult[] }>(`/api/geocode?q=${encodeURIComponent(address)}`)).results,
      create: async (row) => {
        try { await verifyAccount(); }
        catch (error) {
          if (error instanceof ApiError && error.code === "import_account_changed") throw error;
          throw new ApiError("Couldn't verify the current account. Resume to check again.", 401);
        }
        return apiPost("/api/lead", { ...row, expectedUserSub: importUser.current ?? undefined });
      },
      refresh: onImported,
      now: Date.now,
    });
    setProgress(result);
    setNotice(importSummary(result));
    setNow(Date.now());
  };
  const resume = async () => {
    if (!progress || running.current || Date.now() < progress.retryAt) return;
    running.current = true; setBusy(true);
    try { await runImport(progress); }
    catch (error) { setNotice(`${importSummary(progress)} ${error instanceof Error ? error.message : "Couldn't verify the current account. Try Resume again."}`); }
    finally { running.current = false; setBusy(false); }
  };

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
    if (running.current || (progress && progress.next < progress.rows.length)) return;
    running.current = true; setBusy(true); setNotice(null);
    try {
      importUser.current = undefined;
      const state = startImport(parseFarmCsv(await file.text()));
      setProgress(state);
      await runImport(state);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't read that CSV.");
    } finally {
      running.current = false; setBusy(false);
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
        <button className="minibtn" type="button" onClick={() => fileRef.current?.click()} disabled={busy || Boolean(progress && progress.next < progress.rows.length)}>
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
      {notice && <div className="row notice-row" role="status">{notice}</div>}
      {progress && progress.next < progress.rows.length && (
        <div className="farm-toolbar">
          <button className="minibtn" type="button" disabled={busy || waiting > 0} onClick={() => void resume()}>
            {waiting > 0 ? `Resume in ${waiting}s` : "Resume remaining rows"}
          </button>
          <button className="minibtn" type="button" disabled={busy} onClick={() => {
            importUser.current = undefined; setProgress(null); setNotice("Remaining rows discarded. Previously saved rows stay in the farm.");
          }}>Discard remaining rows</button>
          <span>Progress stays here until the page is reloaded. Resume never repeats confirmed or uncertain saves.</span>
        </div>
      )}
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
