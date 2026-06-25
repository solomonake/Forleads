// POST /api/approve — the human gate. Idempotently writes the approved artifact
// to its connector. If the user is signed in with Google, a fresh access token
// is used so the result is a REAL Gmail draft; otherwise it falls back to mock.
// Fail-closed: a compliance-blocked artifact cannot be approved.
import { NextRequest, NextResponse } from "next/server";
import { freshAccessToken } from "@/lib/auth/google";
import { getSession, seal, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { withRoute } from "@/lib/observability";
import { str, validateBody } from "@/lib/validation";
import { approveArtifact } from "@/lib/pipeline";

export const POST = withRoute("approve", async (req: NextRequest) => {
  const body = await validateBody(req, (b) => ({
    artifactId: str(b, "artifactId", { max: 100 }),
    editedBody:
      b.editedBody === undefined || b.editedBody === null
        ? undefined
        : str(b, "editedBody", { max: 10_000 }),
  }));

  // The human gate is a mutating, outward-facing action (it can write a real
  // Gmail draft) — it MUST require an authenticated user. No anonymous approve.
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  // Use the signed-in user's Google token for real drafts (refresh if stale).
  let googleAccessToken: string | undefined;
  let refreshedSession = false;
  if (session.google) {
    try {
      const fresh = await freshAccessToken(session.google);
      googleAccessToken = fresh.access_token;
      if (fresh.access_token !== session.google.access_token) {
        session.google = fresh;
        refreshedSession = true;
      }
    } catch {
      // Token refresh failed → fall back to mock so the loop still completes.
    }
  }

  let result;
  try {
    result = await approveArtifact(body.artifactId, {
      googleAccessToken,
      editedBody: body.editedBody,
    });
  } catch (e) {
    // Fail-closed compliance is a client-correctable 422, not a server error;
    // anything else propagates to the route's error boundary (logged + 500).
    const msg = e instanceof Error ? e.message : "unknown";
    if (msg.includes("compliance")) return NextResponse.json({ error: msg }, { status: 422 });
    throw e;
  }
  if (!result) return NextResponse.json({ error: "artifact not found" }, { status: 404 });

  const res = NextResponse.json(result);
  // Persist a refreshed access token back into the session cookie.
  if (refreshedSession) {
    res.cookies.set(SESSION_COOKIE, seal(session), sessionCookieOptions());
  }
  return res;
});
