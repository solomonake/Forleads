// GET /api/auth/google/login — start the Google consent flow (login + Gmail).
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthUrl, googleConfigured } from "@/lib/auth/google";

export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    // No creds yet → bounce home with a flag the UI explains.
    return NextResponse.redirect(new URL("/?auth=not_configured", req.url));
  }
  const state = randomBytes(16).toString("hex");
  const url = buildAuthUrl(state);
  const res = NextResponse.redirect(url);
  // CSRF: stash state in a short-lived cookie, verified in the callback.
  res.cookies.set("fl_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
