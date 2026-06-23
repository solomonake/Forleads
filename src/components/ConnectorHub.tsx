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

const LABELS: Record<string, string> = {
  google: "Google Workspace · Gmail drafts + Calendar",
  microsoft: "Microsoft 365 · Outlook + Calendar",
  followupboss: "Follow Up Boss · CRM",
  gohighlevel: "GoHighLevel · CRM / agencies",
  twilio: "Twilio · SMS (approved only)",
  zapier: "Zapier / Webhooks",
};

export function ConnectorHub() {
  const [health, setHealth] = useState<Health[]>([]);
  const [accounts, setAccounts] = useState<ConnectorAccount[]>([]);

  useEffect(() => {
    apiGet<{ health: Health[]; accounts: ConnectorAccount[] }>("/api/connectors").then((d) => {
      setHealth(d.health);
      setAccounts(d.accounts);
    });
  }, []);

  const accountFor = (p: string) => accounts.find((a) => a.provider === p);

  return (
    <div className="panel">
      <h1>Connector Hub</h1>
      <div className="sub">
        Trust made visible — exactly what Forleads can do, and whether it's live or running in safe
        mock mode. Scopes are minimal (Gmail: compose drafts only). Every write is idempotent.
      </div>
      <div className="panel-grid">
        {health.map((h) => {
          const acct = accountFor(h.provider);
          return (
            <div className="row" key={h.provider + (acct?.id ?? "")}>
              <div className="rtitle">
                <span>{LABELS[h.provider] ?? h.provider}</span>
                <span className={`pill-status ${h.mode === "live" ? "pill-live" : "pill-mock"}`}>
                  {h.mode === "live" ? "connected · live" : "mock mode"}
                </span>
              </div>
              <div className="rmeta">
                {h.detail}
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
                {h.mode === "mock" ? (
                  <button className="minibtn">Add credentials in .env to go live</button>
                ) : (
                  <button className="minibtn">Manage permissions</button>
                )}
                {h.provider === "zapier" && <button className="minibtn">Copy inbound endpoint</button>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sub" style={{ marginTop: 20 }}>
        Inbound webhook: <code>POST /api/connectors/zapier/inbound</code> (X-Zapier-Secret) lets
        external systems emit domain events into Forleads.
      </div>
    </div>
  );
}
