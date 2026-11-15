// Identity by default; ?connect=1 starts explicit connector consent for the current user.
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthUrl, googleConfigured } from "@/lib/auth/google";

import { getSession, sealValue } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    // No creds yet → bounce home with a flag the UI explains.
    return NextResponse.redirect(new URL("/?auth=not_configured", req.url));
  }
  const intent = req.nextUrl.searchParams.get("connect") === "1" ? "connect" : "signin";
  const session = await getSession();
  if (intent === "connect" && !session) {
    return NextResponse.redirect(new URL("/?auth=error&reason=login_required", req.url));
  }
  const state = randomBytes(16).toString("hex");
  const url = buildAuthUrl(state, intent);
  const res = NextResponse.redirect(url);
  // CSRF: stash state in a short-lived cookie, verified in the callback.
  res.cookies.set("fl_oauth_state", sealValue({ state, intent, sub: intent === "connect" ? session!.sub : undefined, expiresAt: Date.now() + 600_000 }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
