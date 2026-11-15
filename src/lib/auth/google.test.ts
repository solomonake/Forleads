import { describe, expect, it } from "vitest";
import { buildAuthUrl, CONNECTOR_SCOPES, hasGoogleConnectorScopes } from "./google";

describe("Google authorization intent", () => {
  it("ordinary sign-in requests identity without offline or connector consent", () => {
    const p = new URL(buildAuthUrl("csrf")).searchParams;
    expect(p.get("scope")).toBe("openid email profile");
    expect(p.get("access_type")).toBe("online"); expect(p.get("prompt")).toBeNull();
    expect(p.get("include_granted_scopes")).toBe("false");
  });
  it("explicit connect requests the existing connector scopes and refresh grant", () => {
    const p = new URL(buildAuthUrl("csrf", "connect")).searchParams;
    expect(hasGoogleConnectorScopes(p.get("scope")!)).toBe(true);
    expect(p.get("prompt")).toBe("consent"); expect(p.get("access_type")).toBe("offline");
  });
  it("partial, empty or similarly named scopes are not full connector permission", () => {
    for (const s of [undefined, "", CONNECTOR_SCOPES[0], "gmail.compose calendar.events", CONNECTOR_SCOPES.join(" ")+"x"]) expect(hasGoogleConnectorScopes(s)).toBe(false);
  });
});
