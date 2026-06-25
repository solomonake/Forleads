// POST /api/approve — the human gate. Idempotently writes the approved artifact
// to its connector. If the user is signed in with Google, a fresh access token
// is used so the result is a REAL Gmail draft; otherwise it falls back to mock.
// Fail-closed: a compliance-blocked artifact cannot be approved.
import { NextRequest, NextResponse } from "next/server";
import { freshAccessToken } from "@/lib/auth/google";
import { getSession, seal, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { withRoute } from "@/lib/observability";
import { num, str, validateBody } from "@/lib/validation";
import { approveArtifact } from "@/lib/pipeline";
import { ensureCurrentAgent } from "@/lib/auth/agent";
import { loadGoogleCredential, saveGoogleCredential } from "@/lib/auth/credentials";

export const POST = withRoute("approve", async (req: NextRequest) => {
  // The human gate is a mutating, outward-facing action (it can write a real
  // Gmail draft) — it MUST require an authenticated user. No anonymous approve.
  const agentId = await ensureCurrentAgent();
  if (!agentId) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const body = await validateBody(req, (b) => ({
    artifactId: str(b, "artifactId", { max: 100 }),
    expectedRevision: num(b, "expectedRevision", { min: 1 }),
  }));
  const session = await getSession();
  // Use the signed-in user's Google token for real drafts (refresh if stale).
  let googleAccessToken: string | undefined;
  let refreshedSession = false;
  const storedGoogle = session?.googleCredentialRef
    ? await loadGoogleCredential(agentId, session.googleCredentialRef)
    : session?.google;
  if (storedGoogle) {
    try {
      const fresh = await freshAccessToken(storedGoogle);
      googleAccessToken = fresh.access_token;
      if (fresh.access_token !== storedGoogle.access_token && session) {
        session.googleCredentialRef = await saveGoogleCredential(
          agentId,
          fresh,
          session.googleCredentialRef,
        );
        session.google = undefined;
        refreshedSession = true;
      }
    } catch {
      // Token refresh failed → fall back to mock so the loop still completes.
    }
  }

  let result;
  try {
    result = await approveArtifact(body.artifactId, body.expectedRevision, { googleAccessToken });
  } catch (e) {
    // Fail-closed compliance is a client-correctable 422, not a server error;
    // anything else propagates to the route's error boundary (logged + 500).
    const msg = e instanceof Error ? e.message : "unknown";
    if (msg.includes("compliance")) return NextResponse.json({ error: msg }, { status: 422 });
    if (msg.includes("revision")) return NextResponse.json({ error: msg }, { status: 409 });
    throw e;
  }
  if (!result) return NextResponse.json({ error: "artifact not found" }, { status: 404 });

  const res = NextResponse.json(result);
  // Persist a refreshed access token back into the session cookie.
  if (refreshedSession && session) {
    res.cookies.set(SESSION_COOKIE, seal(session), sessionCookieOptions());
  }
  return res;
});
