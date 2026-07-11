"use client";

import { useEffect, useState } from "react";
import { apiGet } from "./ui";

interface CredentialField {
  key: string;
  label: string;
  hint?: string;
  kind: "text" | "password";
  required?: boolean;
  maxLength?: number;
}

interface TenantProviderStatus {
  provider: string;
  displayName: string;
  summary: string;
  authKind: "oauth" | "apiKey" | "webhook" | "unsupported";
  connected: boolean;
  connectedLabel?: string;
  capabilities: string[];
  scopes?: string[];
  docsUrl?: string;
  fields?: CredentialField[];
  connectUrl?: string;
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

interface ConnectorsResponse {
  providers: TenantProviderStatus[];
  dataSources: DataSource[];
}

const SOURCE_PACKS: { title: string; ids: string[] }[] = [
  {
    title: "Map and address",
    ids: ["osm-overpass", "nominatim", "photon", "openaddresses", "census-tiger"],
  },
  {
    title: "Real property images",
    ids: ["mapillary", "google-street-view", "field-photos"],
  },
  {
    title: "Listings and media",
    ids: ["reso-web-api", "mls-grid"],
  },
  {
    title: "Sales, parcels, and comps",
    ids: [
      "attom",
      "rentcast",
      "regrid",
      "reportall",
      "hmlr-price-paid",
      "county-assessor",
      "county-recorder",
      "open-sales",
    ],
  },
  {
    title: "Risk and distress",
    ids: [
      "socrata",
      "fema-nfhl",
      "planning-zoning",
      "tax-delinquency",
      "code-violations",
      "vacant-registry",
      "open-distress",
      "open-hazard",
    ],
  },
  {
    title: "Global building coverage",
    ids: ["microsoft-buildings", "google-open-buildings", "open-buildings"],
  },
  {
    title: "Operator-owned data",
    ids: ["operator-imports", "consented-contact", "automation"],
  },
];

function statusLabel(status: DataSource["status"]): string {
  if (status === "live") return "live";
  if (status === "manual_capture") return "manual capture";
  if (status === "planned") return "planned";
  return "setup required";
}

interface TestOutcome {
  ok: boolean;
  label?: string;
  error?: string;
}

export function ConnectorHub() {
  const [providers, setProviders] = useState<TenantProviderStatus[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [modal, setModal] = useState<TenantProviderStatus | null>(null);
  const [test, setTest] = useState<Record<string, TestOutcome | "pending">>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  async function refresh() {
    const d = await apiGet<ConnectorsResponse>("/api/connectors");
    setProviders(d.providers);
    setDataSources(d.dataSources);
  }

  useEffect(() => {
    refresh().catch(() => {
      // Keep UI empty rather than throwing an uncaught rejection at the root.
    });
  }, []);

  async function disconnect(provider: string) {
    setBusy((b) => ({ ...b, [provider]: true }));
    try {
      await fetch(`/api/connectors/${encodeURIComponent(provider)}/credential`, {
        method: "DELETE",
      });
      await refresh();
      setTest((t) => {
        const next = { ...t };
        delete next[provider];
        return next;
      });
    } finally {
      setBusy((b) => ({ ...b, [provider]: false }));
    }
  }

  async function runTest(provider: string) {
    setTest((t) => ({ ...t, [provider]: "pending" }));
    try {
      const res = await fetch(`/api/connectors/${encodeURIComponent(provider)}/test`, {
        method: "POST",
      });
      const data = (await res.json()) as TestOutcome;
      setTest((t) => ({ ...t, [provider]: data }));
    } catch (e) {
      setTest((t) => ({
        ...t,
        [provider]: { ok: false, error: e instanceof Error ? e.message : "Network error" },
      }));
    }
  }

  return (
    <div className="panel">
      <h1>Connector Hub</h1>
      <div className="sub">
        Each real-estate agent connects their own tools here. Forleads holds the credential
        encrypted at rest, uses it only when you approve a draft, and never shares it across
        accounts.
      </div>

      <h2 className="panel-section-title">Action connectors</h2>
      <div className="panel-grid">
        {providers.map((p) => (
          <ConnectorCard
            key={p.provider}
            status={p}
            busy={busy[p.provider] ?? false}
            testOutcome={test[p.provider]}
            onOpenModal={() => setModal(p)}
            onDisconnect={() => disconnect(p.provider)}
            onTest={() => runTest(p.provider)}
          />
        ))}
      </div>

      {modal && (
        <CredentialModal
          status={modal}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await refresh();
          }}
        />
      )}

      <h2 className="panel-section-title">Lead intelligence sources</h2>
      {SOURCE_PACKS.map((pack) => {
        const packed = dataSources.filter((s) => pack.ids.includes(s.id));
        if (packed.length === 0) return null;
        return (
          <div key={pack.title} className="source-pack">
            <h3>{pack.title}</h3>
            <div className="source-grid">
              {packed.map((source) => (
                <div className="source-card" key={source.id}>
                  <div className="rtitle">
                    <span>{source.label}</span>
                    <span
                      className={`pill-status ${source.status === "live" ? "pill-live" : "pill-mock"}`}
                    >
                      {statusLabel(source.status)}
                    </span>
                  </div>
                  <div className="source-unlocks">{source.unlocks}</div>
                  <div className="source-backed">Backed by: {source.configuredBy.join(" · ")}</div>
                  <div className="rmeta">{source.detail}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConnectorCard({
  status,
  busy,
  testOutcome,
  onOpenModal,
  onDisconnect,
  onTest,
}: {
  status: TenantProviderStatus;
  busy: boolean;
  testOutcome?: TestOutcome | "pending";
  onOpenModal: () => void;
  onDisconnect: () => void;
  onTest: () => void;
}) {
  const label =
    status.connected && status.connectedLabel
      ? `Connected · ${status.connectedLabel}`
      : status.connected
        ? "Connected"
        : "Not connected";

  return (
    <div className="row" data-testid={`connector-${status.provider}`}>
      <div className="rtitle">
        <span>{status.displayName}</span>
        <span className={`pill-status ${status.connected ? "pill-live" : "pill-mock"}`}>
          {label}
        </span>
      </div>
      <div className="rmeta">
        {status.summary}
        <br />
        Capabilities: {status.capabilities.join(" · ")}
        {status.scopes && status.scopes.length > 0 && (
          <>
            <br />
            Scopes: {status.scopes.join(" · ")}
          </>
        )}
      </div>
      <div className="ractions">
        {!status.connected && status.authKind === "oauth" && status.connectUrl && (
          <a className="minibtn primary" href={status.connectUrl}>
            Connect
          </a>
        )}
        {!status.connected && status.authKind === "apiKey" && (
          <button className="minibtn primary" onClick={onOpenModal} disabled={busy}>
            Add credentials
          </button>
        )}
        {status.connected && status.authKind === "apiKey" && (
          <>
            <button className="minibtn" onClick={onTest} disabled={busy}>
              {testOutcome === "pending" ? "Testing…" : "Test"}
            </button>
            <button className="minibtn" onClick={onOpenModal} disabled={busy}>
              Update
            </button>
            <button className="minibtn danger" onClick={onDisconnect} disabled={busy}>
              Disconnect
            </button>
          </>
        )}
        {status.connected && status.authKind === "oauth" && (
          <span className="minibtn" style={{ cursor: "default" }}>
            {status.scopes?.join(" · ") ?? "Connected"}
          </span>
        )}
        {status.authKind === "webhook" && (
          <span className="minibtn" style={{ cursor: "default" }}>
            {status.connected ? "Webhook URL set" : "Set ZAPIER_WEBHOOK_URL"}
          </span>
        )}
      </div>
      {testOutcome && testOutcome !== "pending" && (
        <div
          className="rmeta"
          style={{ color: testOutcome.ok ? "var(--ok)" : "var(--danger)", marginTop: 6 }}
          data-testid={`test-result-${status.provider}`}
        >
          {testOutcome.ok
            ? `Test passed${testOutcome.label ? ` — ${testOutcome.label}` : ""}.`
            : `Test failed: ${testOutcome.error ?? "unknown error"}`}
        </div>
      )}
    </div>
  );
}

function CredentialModal({
  status,
  onClose,
  onSaved,
}: {
  status: TenantProviderStatus;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = status.fields ?? [];
  const canSave = fields.every(
    (f) => !f.required || (values[f.key] ?? "").trim().length > 0,
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/connectors/${encodeURIComponent(status.provider)}/credential`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as {
          error?: string;
        };
        setError(body.error ?? `Save failed (${res.status})`);
        return;
      }
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">Connect {status.displayName}</div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="rmeta" style={{ marginBottom: 12 }}>
            {status.summary}
          </div>
          {status.docsUrl && (
            <div className="rmeta" style={{ marginBottom: 12 }}>
              Where to find these:{" "}
              <a href={status.docsUrl} target="_blank" rel="noreferrer">
                {status.docsUrl}
              </a>
            </div>
          )}
          {fields.map((field) => (
            <label key={field.key} className="modal-field">
              <span className="modal-field-label">
                {field.label}
                {field.required ? " *" : ""}
              </span>
              <input
                type={field.kind === "password" ? "password" : "text"}
                value={values[field.key] ?? ""}
                maxLength={field.maxLength}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [field.key]: e.target.value }))
                }
              />
              {field.hint && <span className="modal-field-hint">{field.hint}</span>}
            </label>
          ))}
          {error && <div className="modal-error">{error}</div>}
        </div>
        <div className="modal-actions">
          <button className="minibtn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="minibtn primary"
            onClick={save}
            disabled={saving || !canSave}
          >
            {saving ? "Saving…" : status.connected ? "Update credential" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
