import { describe, expect, it } from "vitest";
import { connectorSetupCopy } from "./connectorSetupCopy";

describe("connectorSetupCopy", () => {
  it("explains OAuth setup-required approval stops", () => {
    expect(
      connectorSetupCopy({
        authKind: "oauth",
        connected: false,
        displayName: "Google",
      }),
    ).toBe("Approvals that need Google stop as setup-required until OAuth is connected.");
  });

  it("explains API-key setup-required approval stops", () => {
    expect(
      connectorSetupCopy({
        authKind: "apiKey",
        connected: false,
        displayName: "Follow Up Boss",
      }),
    ).toBe(
      "Approvals that need Follow Up Boss stop as setup-required until credentials are added.",
    );
  });

  it("returns no warning for connected providers", () => {
    expect(
      connectorSetupCopy({
        authKind: "apiKey",
        connected: true,
        displayName: "Twilio",
      }),
    ).toBeNull();
  });

  it("explains blocked adapters instead of asking for credentials", () => {
    expect(
      connectorSetupCopy({
        authKind: "apiKey",
        availability: "blocked",
        connected: false,
        displayName: "Follow Up Boss",
        blockedReason: "Contact-bound writes are not implemented yet.",
      }),
    ).toBe("Contact-bound writes are not implemented yet.");
  });
});
