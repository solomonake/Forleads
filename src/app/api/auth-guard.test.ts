// Security regression test for the 2026-06-23 audit (axes 1–3): every mutating
// route must reject an unauthenticated caller with 401, and must NOT honor a
// client-supplied `agentId`. We mock the session as logged-out and assert 401.
import { describe, expect, it, vi } from "vitest";

// Logged-out: no session cookie. getSession is the single source the auth helper
// reads, so mocking it here makes currentAgentId() → null across all routes.
vi.mock("@/lib/auth/session", () => ({
  getSession: () => null,
  seal: (x: unknown) => JSON.stringify(x),
  unseal: () => null,
  SESSION_COOKIE: "fl_session",
  sessionCookieOptions: () => ({}),
}));

import { POST as draftPOST } from "./draft/route";
import { POST as notesPOST } from "./notes/route";
import { POST as leadPOST } from "./lead/route";
import { POST as loopsPOST } from "./loops/route";
import { POST as approvePOST } from "./approve/route";

function post(body: unknown) {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof draftPOST>[0];
}

describe("mutating routes reject unauthenticated callers (401)", () => {
  it("POST /api/lead — even with a forged agentId in the body", async () => {
    const res = await leadPOST(post({ address: "1 A St", lng: -73, lat: 40, agentId: "victim" }));
    expect(res.status).toBe(401);
  });

  it("POST /api/notes", async () => {
    const res = await notesPOST(post({ leadId: "x", body: "called them", agentId: "victim" }));
    expect(res.status).toBe(401);
  });

  it("POST /api/draft", async () => {
    const res = await draftPOST(
      post({ leadId: "x", situation: "no_contact", actionType: "email", agentId: "victim" }),
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/loops", async () => {
    const res = await loopsPOST(post({ loopId: "l", leadId: "x", agentId: "victim" }));
    expect(res.status).toBe(401);
  });

  it("POST /api/approve — no anonymous outward sends", async () => {
    const res = await approvePOST(post({ artifactId: "a" }));
    expect(res.status).toBe(401);
  });
});
