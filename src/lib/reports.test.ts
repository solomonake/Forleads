import { describe, expect, it } from "vitest";
import { deriveRecommendations, type ConnectorAvailability } from "./reports";

const fub = (availability: "ready" | "blocked", connected = false): ConnectorAvailability => ({
  provider: "followupboss",
  availability,
  connected,
});
const google = (connected: boolean): ConnectorAvailability => ({ provider: "google", availability: "ready", connected });

function actions(connectors: ConnectorAvailability[]) {
  return deriveRecommendations([], [], connectors).map((r) => r.action);
}

describe("Recap recommendations never point at a blocked connector (G14)", () => {
  it("does not recommend Follow Up Boss when it is blocked; recommends Google instead", () => {
    const recs = actions([fub("blocked"), google(false)]);
    expect(recs).not.toContain("connect:followupboss");
    expect(recs).toContain("connect:google");
  });

  it("does not recommend Follow Up Boss when connector status is unknown", () => {
    expect(actions([])).not.toContain("connect:followupboss");
  });

  it("recommends Follow Up Boss only when it is ready and not yet connected", () => {
    expect(actions([fub("ready"), google(true)])).toContain("connect:followupboss");
    expect(actions([fub("ready", true), google(true)])).not.toContain("connect:followupboss");
  });

  it("recommends no connector when the only working one is already connected", () => {
    const recs = actions([fub("blocked"), google(true)]);
    expect(recs.filter((a) => a.startsWith("connect:google") || a === "connect:followupboss")).toEqual([]);
  });
});
