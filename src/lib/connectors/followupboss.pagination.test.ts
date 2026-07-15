import { beforeEach, describe, expect, it, vi } from "vitest";
import { FollowUpBossConnector } from "./followupboss";

const connector = () => new FollowUpBossConnector(
  "fka_test",
  "https://api.followupboss.test/v1",
  false,
  "Forleads",
  "system-secret",
  {
    workspaceId: "workspace-7",
    userId: 42,
    label: "agent@example.com",
    verifiedAt: "2026-07-15T12:00:00.000Z",
  },
  3,
);
const meta = { idempotencyKey: "sync", agentId: "agent-a" };
const person = (id: number, street: string) => ({
  id,
  name: `Person ${id}`,
  emails: [{ value: `p${id}@example.com`, isPrimary: 1 }],
  phones: [{ value: `405555${String(id).padStart(4, "0")}` }],
  addresses: [{ street, city: "Edmond", state: "OK", code: "73034" }],
});

describe("FollowUpBossConnector pagination", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("follows only the opaque next token and returns a complete batch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        people: [person(1, "1 First St")],
        _metadata: { next: "cursor-2", nextLink: "https://evil.example/steal" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        people: [person(2, "2 Second St")],
        _metadata: { next: null },
      }), { status: 200 }));

    const result = await connector().syncContacts(meta);
    expect(result).toMatchObject({ imported: 2, complete: true, duplicateIds: 0 });
    const second = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(second.origin).toBe("https://api.followupboss.test");
    expect(second.searchParams.get("next")).toBe("cursor-2");
  });

  it("detects repeated cursors and conflicting duplicate person records", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        people: [person(1, "1 First St")], _metadata: { next: "same" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        people: [person(1, "99 Other St")], _metadata: { next: "same" },
      }), { status: 200 }));
    await expect(connector().syncContacts(meta)).rejects.toThrow(/conflicting records|repeated/i);
  });

  it.each([401, 403, 429, 503])("fails closed on HTTP %s without partial success", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("no", { status }));
    await expect(connector().syncContacts(meta)).rejects.toThrow(`failed with ${status}`);
  });

  it("rejects malformed JSON, schema drift, and unsafe cursors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    await expect(connector().syncContacts(meta)).rejects.toThrow(/invalid JSON/);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ contacts: [] }), { status: 200 }));
    await expect(connector().syncContacts(meta)).rejects.toThrow(/schema changed/);

    vi.restoreAllMocks();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(connector().syncContacts(meta, "bad&cursor=https://evil.example"))
      .rejects.toThrow(/Invalid.*cursor/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
