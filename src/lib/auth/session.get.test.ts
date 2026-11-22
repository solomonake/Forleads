import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "fl_session" && jar.value ? { name, value: jar.value } : undefined),
  }),
}));

import { getSession, seal, sealValue, SESSION_MAX_AGE_MS } from "./session";

const env = process.env as Record<string, string | undefined>;

describe("getSession", () => {
  beforeEach(() => {
    env.SESSION_SECRET = "test-secret-123";
    jar.value = undefined;
  });

  it("returns a fresh real session", async () => {
    jar.value = seal({ sub: "u1", name: "A", email: "a@b.com", createdAt: Date.now() });
    expect((await getSession())?.sub).toBe("u1");
  });

  it("refuses the OAuth state cookie pasted in as a session", async () => {
    jar.value = sealValue({ state: "csrf", intent: "signin", expiresAt: Date.now() + 600_000 });
    expect(await getSession()).toBeNull();
  });

  it("refuses an old session but keeps one that was refreshed recently", async () => {
    const old = Date.now() - SESSION_MAX_AGE_MS - 1000;
    jar.value = seal({ sub: "u1", name: "A", email: "a@b.com", createdAt: old });
    expect(await getSession()).toBeNull();
    jar.value = seal({ sub: "u1", name: "A", email: "a@b.com", createdAt: old, refreshedAt: Date.now() });
    expect((await getSession())?.sub).toBe("u1");
  });
});
