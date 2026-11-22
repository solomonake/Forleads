import { afterEach, describe, expect, it } from "vitest";
import { isValidSession, seal, sealValue, unseal, unsealValue, SESSION_MAX_AGE_MS, type Session } from "./session";

// Mutate process.env IN PLACE (don't reassign the object — seal/key read the
// live reference). NODE_ENV is typed read-only, so go through a loosened view.
const env = process.env as Record<string, string | undefined>;
const ORIG = {
  SESSION_SECRET: env.SESSION_SECRET,
  NEXTAUTH_SECRET: env.NEXTAUTH_SECRET,
  NODE_ENV: env.NODE_ENV,
};
afterEach(() => {
  env.SESSION_SECRET = ORIG.SESSION_SECRET;
  env.NEXTAUTH_SECRET = ORIG.NEXTAUTH_SECRET;
  env.NODE_ENV = ORIG.NODE_ENV;
});

const s: Session = { sub: "u1", name: "A", email: "a@b.com", createdAt: 1 };

describe("session secret — fail closed", () => {
  it("round-trips with a configured secret", () => {
    process.env.SESSION_SECRET = "test-secret-123";
    expect(unseal(seal(s))?.sub).toBe("u1");
  });

  it("REFUSES an insecure default in production (no forgeable session)", () => {
    delete process.env.SESSION_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    env.NODE_ENV = "production";
    expect(() => seal(s)).toThrow(/SESSION_SECRET is required/);
  });

  it("keeps a dev fallback outside production (local dev/tests work)", () => {
    delete process.env.SESSION_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    env.NODE_ENV = "test";
    expect(() => seal(s)).not.toThrow();
  });
});

describe("session shape and lifetime", () => {
  const now = 1_800_000_000_000;
  it("accepts a fresh, well-formed session", () => {
    expect(isValidSession({ ...s, createdAt: now - 1000 }, now)).toBe(true);
  });
  it("rejects another sealed value, such as the OAuth state cookie", () => {
    process.env.SESSION_SECRET = "test-secret-123";
    const stateCookie = sealValue({ state: "csrf", intent: "signin", expiresAt: now + 600_000 });
    expect(isValidSession(unsealValue(stateCookie), now)).toBe(false);
  });
  it("rejects a session with no subject", () => {
    expect(isValidSession({ ...s, sub: "", createdAt: now }, now)).toBe(false);
    expect(isValidSession({ name: "A", createdAt: now }, now)).toBe(false);
  });
  it("rejects expired and future-dated sessions", () => {
    expect(isValidSession({ ...s, createdAt: now - SESSION_MAX_AGE_MS - 1 }, now)).toBe(false);
    expect(isValidSession({ ...s, createdAt: now + 10 * 60_000 }, now)).toBe(false);
    expect(isValidSession({ ...s, createdAt: Number.NaN }, now)).toBe(false);
  });
});
