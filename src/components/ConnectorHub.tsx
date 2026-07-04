"use client";

import { useEffect, useState } from "react";
import type { ConnectorAccount } from "@/lib/core/types";
import { apiGet } from "./ui";

interface Health {
  provider: string;
  healthy: boolean;
  mode: "mock" | "live";
  detail: string;
  capabilities: string[];
}

interface DataSource {
  id: string;
  label: string;
  status: "live" | "setup_required" | "manual_capture" | "planned";
  unlocks: string;
  configuredBy: string[];
  detail: string;
  env: string[];
}

const LABELS: Record<string, string> = {
  google: "Google Workspace · Gmail drafts + Calendar",
  microsoft: "Microsoft 365 · Outlook + Calendar",
  followupboss: "Follow Up Boss · CRM",
  gohighlevel: "GoHighLevel · CRM / agencies",
  twilio: "Twilio · SMS (approved only)",
  zapier: "Zapier / Webhooks",
};

const SOURCE_PACKS: { title: string; ids: string[] }[] = [
  {
    title: "Open source pack",
    ids: ["geocode", "osm", "open-buildings", "open-sales", "open-distress", "open-hazard"],
  },
  { title: "Field scout pack", ids: ["field-scout"] },
  {
    title: "Regional proof packs",
    ids: ["region-america", "region-england-wales", "region-europe", "region-africa"],
  },
  { title: "Consented contact pack", ids: ["consented-contact"] },
  { title: "Automation bridge", ids: ["open-automation"] },
];

function statusLabel(status: DataSource["status"]): string {
  if (status === "live") return "live";
  if (status === "manual_capture") return "manual capture";
  if (status === "planned") return "planned";
  return "setup required";
}

export function ConnectorHub() {
  const [health, setHealth] = useState<Health[]>([]);
  const [accounts, setAccounts] = useState<ConnectorAccount[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [gmailUser, setGmailUser] = useState<{ email: string } | null>(null);

  useEffect(() => {
    apiGet<{ health: Health[]; accounts: ConnectorAccount[]; dataSources: DataSource[] }>("/api/connectors").then((d) => {
      setHealth(d.health);
      setAccounts(d.accounts);
      setDataSources(d.dataSources);
    });
    apiGet<{ user: { email: string; gmailConnected: boolean } | null }>("/api/auth/session").then(
      (d) => {
        if (d.user?.gmailConnected) setGmailUser({ email: d.user.email });
      }
    );
  }, []);

  const accountFor = (p: string) => accounts.find((a) => a.provider === p);

  return (
    <div className="panel">
      <h1>Connector Hub</h1>
      <div className="sub">
        Trust made visible: which actions Forleads can write today, which intelligence sources are
        live, and which setup gates block owner, ARV, distress, contacts, mail, or dialer work.
      </div>

      <h2 className="panel-section-title">Action connectors</h2>
      <div className="panel-grid">
        {health.map((h) => {
          const acct = accountFor(h.provider);
          const live = h.mode === "live" || (h.provider === "google" && Boolean(gmailUser));
          const setupRequired = !live && !h.healthy;
          return (
            <div className="row" key={h.provider + (acct?.id ?? "")}>
              <div className="rtitle">
                <span>{LABELS[h.provider] ?? h.provider}</span>
                <span className={`pill-status ${live ? "pill-live" : "pill-mock"}`}>
                  {live ? "connected · live" : setupRequired ? "setup required" : "local mock"}
                </span>
              </div>
              <div className="rmeta">
                {h.provider === "google" && gmailUser
                  ? `Connected as ${gmailUser.email} — real Gmail drafts on approve.`
                  : h.detail}
                <br />
                Capabilities: {h.capabilities.join(" · ")}
                {acct && acct.scopes.length > 0 && (
                  <>
                    <br />
                    Scopes: {acct.scopes.join(" · ")}
                  </>
                )}
              </div>
              <div className="ractions">
                {h.provider === "google" && !gmailUser && (
                  <a className="minibtn primary" href="/api/auth/google/login">
                    Connect Google (Gmail drafts)
                  </a>
                )}
                {h.provider === "google" && gmailUser && (
                  <span className="minibtn" style={{ cursor: "default" }}>
                    Scopes: gmail.compose · calendar.events
                  </span>
                )}
                {h.provider !== "google" &&
                  (!live ? (
                    <button className="minibtn">Add credentials in .env to go live</button>
                  ) : (
                    <button className="minibtn">Manage permissions</button>
                  ))}
                {h.provider === "zapier" && <button className="minibtn">Copy inbound endpoint</button>}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="panel-section-title">Lead intelligence sources</h2>
      {SOURCE_PACKS.map((pack) => {
        const packed = dataSources.filter((source) => pack.ids.includes(source.id));
        if (packed.length === 0) return null;
        return (
          <div key={pack.title} className="source-pack">
            <h3>{pack.title}</h3>
            <div className="source-grid">
              {packed.map((source) => (
                <div className="source-card" key={source.id}>
                  <div className="rtitle">
                    <span>{source.label}</span>
                    <span className={`pill-status ${source.status === "live" ? "pill-live" : "pill-mock"}`}>
                      {statusLabel(source.status)}
                    </span>
                  </div>
                  <div className="source-unlocks">{source.unlocks}</div>
                  <div className="rmeta">{source.detail}</div>
                  <div className="source-env">
                    {source.env.map((key) => (
                      <code key={key}>{key}</code>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="sub" style={{ marginTop: 20 }}>
        Inbound webhook: <code>POST /api/connectors/zapier/inbound</code> (X-Zapier-Secret) lets
        external systems emit domain events into Forleads.
      </div>
    </div>
  );
}
