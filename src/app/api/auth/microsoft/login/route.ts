// GET /api/auth/microsoft/login — start the Microsoft consent flow (Outlook +
// Calendar). Only signed-in agents may connect Microsoft: the tenant scope
// binds the credential to the current agent_id in the callback.
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAgentId } from "@/lib/auth/agent";
import { buildAuthUrl, microsoftConfigured } from "@/lib/auth/microsoft";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!microsoftConfigured()) {
    return NextResponse.redirect(new URL("/?connect=microsoft&status=not_configured", req.url));
  }
  const agentId = await requireAgentId();
  if (!agentId) {
    return NextResponse.redirect(new URL("/?connect=microsoft&status=login_required", req.url));
  }
  const state = randomBytes(16).toString("hex");
  const url = buildAuthUrl(state);
  const res = NextResponse.redirect(url);
  // CSRF: stash state in a short-lived cookie, verified in the callback.
  res.cookies.set("fl_ms_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
