import { describe, expect, it } from "vitest";
import { contactabilityPassport } from "./contactability";

describe("contactabilityPassport", () => {
  it("keeps a phone number unavailable for SMS until permission is recorded", () => {
    const passport = contactabilityPassport({ phone: "+1 405 555 0100", source: "agent_entered" });

    expect(passport.summary).toBe("verification_needed");
    expect(passport.channels.find((entry) => entry.channel === "sms")).toMatchObject({
      state: "unknown",
      detail: "Available; permission not verified",
    });
  });

  it("lets an explicit opt-out override a stale allowed value", () => {
    const passport = contactabilityPassport({
      email: "known@example.test",
      emailPermission: "allowed",
      optOutEmail: true,
    });

    expect(passport.channels.find((entry) => entry.channel === "email")?.state).toBe("blocked");
  });

  it("shows source, verification, and provider-independent allowed channels", () => {
    const passport = contactabilityPassport({
      email: "known@example.test",
      phone: "+1 405 555 0100",
      source: "first_party",
      sourceLabel: "Open-house sign-in",
      verifiedAt: "2026-07-15T12:00:00.000Z",
      emailPermission: "allowed",
      smsPermission: "opted_out",
      callPermission: "allowed",
      providerRefs: { followupboss: "123" },
    });

    expect(passport.summary).toBe("contactable");
    expect(passport.source).toBe("Open-house sign-in");
    expect(passport.verifiedAt).toBe("2026-07-15T12:00:00.000Z");
    expect(passport.channels.map((entry) => [entry.channel, entry.state])).toEqual([
      ["email", "allowed"],
      ["sms", "blocked"],
      ["call", "allowed"],
    ]);
  });

  it("does not infer a relationship when no contact exists", () => {
    expect(contactabilityPassport(undefined)).toMatchObject({
      summary: "missing",
      source: "Source not recorded",
    });
  });
});
