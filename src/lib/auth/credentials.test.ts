import { beforeEach, describe, expect, it } from "vitest";
import { loadGoogleCredential, saveGoogleCredential } from "./credentials";

beforeEach(() => {
  const globalRepo = globalThis as unknown as {
    __forleadsRepo?: unknown;
    __forleadsSeeded?: unknown;
  };
  globalRepo.__forleadsRepo = undefined;
  globalRepo.__forleadsSeeded = undefined;
});

describe("server-side connector credentials", () => {
  it("encrypts tokens at rest and scopes retrieval to the owning agent", async () => {
    const tokens = {
      access_token: "secret-access",
      refresh_token: "secret-refresh",
      expiry: Date.now() + 60_000,
      scope: "gmail.compose",
    };
    const id = await saveGoogleCredential("agent-a", tokens);
    expect(await loadGoogleCredential("agent-a", id)).toEqual(tokens);
    expect(await loadGoogleCredential("agent-b", id)).toBeNull();
  });

  it("rotates an existing credential in place", async () => {
    const first = await saveGoogleCredential("agent-a", {
      access_token: "one",
      expiry: 1,
      scope: "gmail.compose",
    });
    const second = await saveGoogleCredential(
      "agent-a",
      { access_token: "two", expiry: 2, scope: "gmail.compose" },
      first,
    );
    expect(second).toBe(first);
    expect((await loadGoogleCredential("agent-a", first))?.access_token).toBe("two");
  });
});
