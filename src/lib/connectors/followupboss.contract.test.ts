import { beforeEach, describe, expect, it, vi } from "vitest";
import { FollowUpBossConnector } from "./followupboss";
import { resetIdempotencyLedger } from "./idempotency";

const identity = {
  workspaceId: "workspace-7",
  userId: 42,
  label: "agent@example.com",
  verifiedAt: "2026-07-15T12:00:00.000Z",
};
const binding = {
  contactId: "123",
  workspaceId: "workspace-7",
  credentialVersion: 3,
  syncedAt: "2026-07-15T12:00:00.000Z",
};
const meta = (key: string, providerContact = binding) => ({
  idempotencyKey: key,
  agentId: "agent-a",
  providerContact,
});

function connector() {
  return new FollowUpBossConnector(
    "fka_test",
    "https://api.followupboss.test/v1",
    false,
    "Forleads",
    "system-secret",
    identity,
    3,
  );
}

describe("FollowUpBossConnector person-bound writes", () => {
  beforeEach(() => {
    resetIdempotencyLedger();
    vi.restoreAllMocks();
  });

  it("writes a note with trusted personId and required integration headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 9001 }), { status: 200 }),
    );
    const result = await connector().writeCrmNote(
      { body: "Grounded follow-up", tags: ["not-supported-by-notes"] },
      meta("note-1"),
    );

    expect(result).toMatchObject({ ok: true, externalId: "9001", state: "succeeded" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.followupboss.test/v1/notes");
    expect(init?.headers).toMatchObject({
      "X-System": "Forleads",
      "X-System-Key": "system-secret",
    });
    expect(JSON.parse(String(init?.body))).toEqual({ personId: 123, body: "Grounded follow-up" });
  });

  it("writes a task with person, verified assignee, type, and dueDateTime", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 9002 }), { status: 200 }),
    );
    await connector().createTask(
      { title: "Call Alex", dueAt: "2026-07-18T15:30:00.000Z" },
      meta("task-1"),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      personId: 123,
      assignedUserId: 42,
      name: "Call Alex",
      type: "Follow Up",
      dueDateTime: "2026-07-18T15:30:00.000Z",
    });
  });

  it("keeps the appointment contract person-bound without advertising routing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 9003 }), { status: 200 }),
    );
    await connector().createCalendarEvent({
      title: "Seller consult",
      startAt: "2026-07-18T15:30:00.000Z",
      endAt: "2026-07-18T16:00:00.000Z",
      notes: "Review options",
    }, meta("appointment-1"));
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://api.followupboss.test/v1/appointments?sendInvitation=false",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toMatchObject({
      invitees: [{ personId: 123 }],
    });
  });

  it("performs zero fetches for missing, stale, or wrong-workspace bindings", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const missing = await connector().writeCrmNote({ body: "note" }, {
      idempotencyKey: "missing",
      agentId: "agent-a",
    });
    const wrongWorkspace = await connector().writeCrmNote(
      { body: "note" },
      meta("wrong-workspace", { ...binding, workspaceId: "workspace-other" }),
    );
    const stale = await connector().writeCrmNote(
      { body: "note" },
      meta("stale", { ...binding, credentialVersion: 2 }),
    );
    expect([missing, wrongWorkspace, stale].every((result) => !result.ok)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats an environment identity as configuration evidence, not verification", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const unverified = new FollowUpBossConnector(
      "fka_test",
      "https://api.followupboss.test/v1",
      false,
      "Forleads",
      "system-secret",
      { ...identity, verifiedAt: "environment" },
      3,
    );
    const result = await unverified.writeCrmNote({ body: "note" }, meta("env-identity"));
    expect(result).toMatchObject({ ok: false, mode: "mock" });
    await expect(unverified.healthCheck()).resolves.toMatchObject({ healthy: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks an unreadable successful response indeterminate and never calls twice", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", { status: 200 }),
    );
    const result = await connector().writeCrmNote({ body: "note" }, meta("indeterminate"));
    expect(result).toMatchObject({ ok: false, state: "indeterminate" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
