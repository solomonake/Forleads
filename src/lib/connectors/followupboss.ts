// Follow Up Boss client + connector. The adapter never trusts a person id in
// artifact content: approval resolves a workspace-scoped binding server-side
// and passes it through ConnectorWriteMeta.

import type {
  CalendarPayload,
  CrmNotePayload,
  EmailPayload,
  SmsPayload,
  TaskPayload,
} from "@/lib/core/types";
import { once } from "./idempotency";
import type {
  Connector,
  ConnectorResult,
  ConnectorWriteMeta,
  ContactSyncResult,
  HealthStatus,
  SyncedConnectorContact,
} from "./types";

const PEOPLE_FIELDS = "name,firstName,lastName,emails,phones,addresses,stage,source,updated";
const PAGE_SIZE = 100;
const MAX_PAGES_PER_BATCH = 5;
const MAX_RESPONSE_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 12_000;

export interface FollowUpBossVerifiedIdentity {
  workspaceId: string;
  userId: number;
  label: string;
  verifiedAt: string;
}

export interface FollowUpBossCredential {
  apiKey?: string;
  identity?: FollowUpBossVerifiedIdentity;
}

interface FubValue {
  value?: unknown;
  isPrimary?: unknown;
}

interface FubAddress {
  street?: unknown;
  city?: unknown;
  state?: unknown;
  code?: unknown;
  country?: unknown;
}

interface FubPerson {
  id?: unknown;
  name?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  emails?: unknown;
  phones?: unknown;
  addresses?: unknown;
}

interface FubPeoplePage {
  people?: unknown;
  _metadata?: { next?: unknown };
}

export class FollowUpBossReadError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "FollowUpBossReadError";
    this.status = status;
  }
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveId(value: unknown): string | undefined {
  const text = typeof value === "number" ? String(value) : asText(value);
  return text && /^\d+$/.test(text) && Number(text) > 0 ? text : undefined;
}

function primaryValue(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter((entry): entry is FubValue => Boolean(entry) && typeof entry === "object");
  const primary = entries.find((entry) => entry.isPrimary === true || entry.isPrimary === 1);
  return asText(primary?.value) ?? entries.map((entry) => asText(entry.value)).find(Boolean);
}

function contactAddress(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const address = value as FubAddress;
  const street = asText(address.street);
  const city = asText(address.city);
  const state = asText(address.state);
  const code = asText(address.code);
  if (!street || !city || !state) return undefined;
  return [street, `${city},`, state, code, asText(address.country)].filter(Boolean).join(" ");
}

function normalizePerson(person: FubPerson): SyncedConnectorContact {
  const providerContactId = positiveId(person.id);
  if (!providerContactId) throw new FollowUpBossReadError("FUB people response contained an invalid person id.");
  const first = asText(person.firstName);
  const last = asText(person.lastName);
  const name = asText(person.name) ?? ([first, last].filter(Boolean).join(" ") || undefined);
  const addresses = Array.isArray(person.addresses)
    ? person.addresses.map(contactAddress).filter((item): item is string => Boolean(item))
    : [];
  return {
    provider: "followupboss",
    providerContactId,
    name,
    email: primaryValue(person.emails),
    phone: primaryValue(person.phones),
    addresses,
  };
}

function cursorIsSafe(cursor: string): boolean {
  return cursor.length <= 2048 && /^[A-Za-z0-9._~+/=-]+$/.test(cursor);
}

function resultError(
  meta: ConnectorWriteMeta,
  error: string,
  mode: "mock" | "live",
  state: ConnectorResult["state"] = "failed",
): ConnectorResult {
  return {
    ok: false,
    provider: "followupboss",
    idempotencyKey: meta.idempotencyKey,
    deduped: false,
    mode,
    error,
    state,
  };
}

export class FollowUpBossConnector implements Connector {
  readonly provider = "followupboss" as const;
  readonly capabilities = ["writeCrmNote", "createTask", "syncContacts"];
  readonly mode: "mock" | "live";

  constructor(
    private apiKey?: string,
    private baseUrl = "https://api.followupboss.com/v1",
    private readonly mockWritesEnabled = true,
    private readonly systemName?: string,
    private readonly systemKey?: string,
    private readonly identity?: FollowUpBossVerifiedIdentity,
    private readonly credentialVersion?: number,
  ) {
    this.baseUrl = this.baseUrl.replace(/\/+$/, "");
    this.mode = apiKey && systemName && systemKey && identity && identity.verifiedAt !== "environment"
      ? "live"
      : "mock";
  }

  private authHeader(): string {
    return "Basic " + Buffer.from(`${this.apiKey}:`).toString("base64");
  }

  private identityIsVerified(): boolean {
    return Boolean(this.identity && this.identity.verifiedAt !== "environment");
  }

  private headers(): Record<string, string> {
    return {
      Authorization: this.authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-System": this.systemName!,
      "X-System-Key": this.systemKey!,
    };
  }

  private configured(meta: ConnectorWriteMeta): ConnectorResult | null {
    if (!this.apiKey) {
      return this.mockWritesEnabled ? null : resultError(
        meta,
        "Follow Up Boss is not configured. Add a tenant API key after system registration.",
        "mock",
      );
    }
    if (!this.systemName || !this.systemKey) {
      return resultError(
        meta,
        "Follow Up Boss system registration is required before customer API access.",
        "mock",
      );
    }
    return null;
  }

  private personId(meta: ConnectorWriteMeta): number | ConnectorResult {
    const missing = this.configured(meta);
    if (missing) return missing;
    const binding = meta.providerContact;
    const contactId = positiveId(binding?.contactId);
    if (!binding || !contactId) {
      return resultError(meta, "Follow Up Boss contact binding is missing. Sync this contact before approval.", this.mode);
    }
    if (!this.identityIsVerified() || !this.identity || binding.workspaceId !== this.identity.workspaceId) {
      return resultError(meta, "Follow Up Boss workspace changed. Re-test the credential and resync contacts.", this.mode);
    }
    if (!this.credentialVersion || binding.credentialVersion !== this.credentialVersion) {
      return resultError(meta, "Follow Up Boss credential changed. Resync contacts before writing.", this.mode);
    }
    return Number(contactId);
  }

  private async post(
    path: string,
    body: (personId: number) => unknown,
    meta: ConnectorWriteMeta,
    mockKind: string,
  ): Promise<ConnectorResult> {
    const configured = this.configured(meta);
    if (configured) return configured;
    if (!this.apiKey) {
      return {
        ok: true,
        provider: "followupboss",
        externalId: `fub_mock_${mockKind}_${meta.idempotencyKey}`,
        idempotencyKey: meta.idempotencyKey,
        deduped: false,
        mode: "mock",
        state: "succeeded",
      };
    }
    const bound = this.personId(meta);
    if (typeof bound !== "number") return bound;

    return once(`${meta.agentId}:${meta.idempotencyKey}`, async () => {
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(body(bound)),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const text = await res.text();
        if (!res.ok) {
          return resultError(meta, `FUB ${path} failed with ${res.status}.`, "live", "failed");
        }
        let data: { id?: unknown };
        try {
          data = text ? JSON.parse(text) as { id?: unknown } : {};
        } catch {
          return resultError(
            meta,
            `FUB ${path} accepted the write but returned an unreadable response. Reconcile in FUB before retrying.`,
            "live",
            "indeterminate",
          );
        }
        const externalId = positiveId(data.id);
        if (!externalId) {
          return resultError(
            meta,
            `FUB ${path} accepted the write without a record id. Reconcile in FUB before retrying.`,
            "live",
            "indeterminate",
          );
        }
        return {
          ok: true,
          provider: "followupboss",
          externalId,
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "live",
          state: "succeeded",
        };
      } catch {
        return resultError(
          meta,
          `FUB ${path} write outcome is unknown after a network failure. Reconcile in FUB before retrying.`,
          "live",
          "indeterminate",
        );
      }
    });
  }

  writeCrmNote(payload: CrmNotePayload, meta: ConnectorWriteMeta) {
    return this.post("/notes", (personId) => ({ personId, body: payload.body }), meta, "note");
  }

  createTask(payload: TaskPayload, meta: ConnectorWriteMeta) {
    if (this.apiKey && (!this.identityIsVerified() || !this.identity?.userId)) {
      return Promise.resolve(resultError(
        meta,
        "Follow Up Boss user identity is not verified. Test the connection before creating tasks.",
        this.mode,
      ));
    }
    return this.post(
      "/tasks",
      (personId) => ({
        personId,
        assignedUserId: this.identity?.userId,
        name: payload.title,
        type: "Follow Up",
        dueDateTime: payload.dueAt,
      }),
      meta,
      "task",
    );
  }

  createCalendarEvent(payload: CalendarPayload, meta: ConnectorWriteMeta) {
    return this.post(
      "/appointments?sendInvitation=false",
      (personId) => ({
        title: payload.title,
        description: payload.notes,
        start: payload.startAt,
        end: payload.endAt,
        invitees: [{ personId }],
      }),
      meta,
      "appointment",
    );
  }

  async syncContacts(meta: ConnectorWriteMeta, cursor?: string): Promise<ContactSyncResult> {
    const configured = this.configured(meta);
    if (configured) throw new FollowUpBossReadError(configured.error ?? "FUB is not configured.", 424);
    if (!this.apiKey) return { imported: 0, mode: "mock", contacts: [], complete: true };
    if (!this.identityIsVerified() || !this.identity || !this.credentialVersion) {
      throw new FollowUpBossReadError("Test the Follow Up Boss credential before syncing contacts.", 424);
    }
    if (cursor && !cursorIsSafe(cursor)) {
      throw new FollowUpBossReadError("Invalid Follow Up Boss pagination cursor.", 400);
    }

    const contacts = new Map<string, SyncedConnectorContact>();
    const seenCursors = new Set<string>();
    let next = cursor;
    let bytes = 0;
    let duplicateIds = 0;

    for (let page = 0; page < MAX_PAGES_PER_BATCH; page += 1) {
      if (next) {
        if (seenCursors.has(next)) throw new FollowUpBossReadError("FUB pagination repeated a cursor.");
        seenCursors.add(next);
      }
      const url = new URL(`${this.baseUrl}/people`);
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("fields", PEOPLE_FIELDS);
      if (next) url.searchParams.set("next", next);

      let res: Response;
      try {
        res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch {
        throw new FollowUpBossReadError("FUB contact sync timed out or could not reach the provider.");
      }
      if (!res.ok) {
        const status = res.status === 401 || res.status === 403 ? 424 : res.status === 429 ? 429 : 502;
        throw new FollowUpBossReadError(`FUB contact sync failed with ${res.status}.`, status);
      }
      const text = await res.text();
      bytes += text.length;
      if (bytes > MAX_RESPONSE_BYTES) throw new FollowUpBossReadError("FUB contact sync exceeded its response budget.");
      let data: FubPeoplePage;
      try {
        data = JSON.parse(text) as FubPeoplePage;
      } catch {
        throw new FollowUpBossReadError("FUB contact sync returned invalid JSON.");
      }
      if (!Array.isArray(data.people) || !data._metadata || typeof data._metadata !== "object") {
        throw new FollowUpBossReadError("FUB people response schema changed; no contacts were imported.");
      }
      for (const raw of data.people) {
        if (!raw || typeof raw !== "object") throw new FollowUpBossReadError("FUB people response contained an invalid record.");
        const normalized = normalizePerson(raw as FubPerson);
        const prior = contacts.get(normalized.providerContactId);
        if (prior) {
          duplicateIds += 1;
          if (JSON.stringify(prior) !== JSON.stringify(normalized)) {
            throw new FollowUpBossReadError("FUB returned conflicting records for one person id.");
          }
          continue;
        }
        contacts.set(normalized.providerContactId, normalized);
      }

      const rawNext = data._metadata.next;
      next = rawNext === null || rawNext === undefined || rawNext === "" ? undefined : asText(rawNext);
      if (rawNext && (!next || !cursorIsSafe(next))) {
        throw new FollowUpBossReadError("FUB returned an unsafe pagination cursor.");
      }
      if (!next) {
        return {
          imported: contacts.size,
          mode: "live",
          contacts: [...contacts.values()],
          complete: true,
          duplicateIds,
        };
      }
    }

    return {
      imported: contacts.size,
      mode: "live",
      contacts: [...contacts.values()],
      nextCursor: next,
      complete: false,
      duplicateIds,
    };
  }

  private no(meta: ConnectorWriteMeta, what: string): Promise<ConnectorResult> {
    return Promise.resolve(resultError(meta, `${what} is not supported by Follow Up Boss.`, this.mode));
  }

  createDraft(_payload: EmailPayload, meta: ConnectorWriteMeta) {
    return this.no(meta, "Email drafts");
  }

  updateDraft(_id: string, _payload: EmailPayload, meta: ConnectorWriteMeta) {
    return this.no(meta, "Email draft updates");
  }

  sendSms(_payload: SmsPayload, meta: ConnectorWriteMeta) {
    return this.no(meta, "SMS");
  }

  async healthCheck(): Promise<HealthStatus> {
    const registered = Boolean(this.systemName && this.systemKey);
    return {
      provider: "followupboss",
      healthy: Boolean(this.apiKey && registered && this.identityIsVerified()),
      mode: this.mode,
      detail: !registered
        ? "Setup blocked — register Forleads with Follow Up Boss first."
        : !this.apiKey
          ? "Not connected — add a tenant API key in Connector Hub."
          : !this.identityIsVerified()
            ? "Credential saved — run the identity test before syncing."
            : `Verified as ${this.identity?.label ?? "Follow Up Boss user"}.`,
      capabilities: this.capabilities,
    };
  }
}
