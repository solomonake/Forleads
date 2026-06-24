// POST /api/approve — the human gate. Idempotently writes the approved artifact
// to its connector. If the user is signed in with Google, a fresh access token
// is used so the result is a REAL Gmail draft; otherwise it falls back to mock.
// Fail-closed: a compliance-blocked artifact cannot be approved.
import { NextRequest, NextResponse } from "next/server";
import { freshAccessToken } from "@/lib/auth/google";
import { getSession, seal, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { approveArtifact } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { artifactId: string };
    if (!body.artifactId) {
      return NextResponse.json({ error: "artifactId required" }, { status: 400 });
    }

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

    const result = await approveArtifact(body.artifactId, { googleAccessToken });
    if (!result) return NextResponse.json({ error: "artifact not found" }, { status: 404 });

    const res = NextResponse.json(result);
    // Persist a refreshed access token back into the session cookie.
    if (refreshedSession && session) {
      res.cookies.set(SESSION_COOKIE, seal(session), sessionCookieOptions());
    }
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = msg.includes("compliance") ? 422 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
