// GET /api/auth/google/callback — exchange the code, capture the user's profile
// (name/email/picture) + Gmail/Calendar tokens, seal them into the session
// cookie, and bind the agent identity so drafts come from the real user.
import { NextRequest, NextResponse } from "next/server";
import { agentIdForSub } from "@/lib/auth/agent";
import { config } from "@/lib/core/config";
import { exchangeCode, fetchProfile } from "@/lib/auth/google";
import { SESSION_COOKIE, seal, sessionCookieOptions, type Session } from "@/lib/auth/session";
import { getRepo } from "@/lib/db";
import { provisionWorkspace } from "@/lib/db/seed";
import { saveGoogleCredential } from "@/lib/auth/credentials";
import { log } from "@/lib/observability";
import { sendWelcomeEmail } from "@/lib/email/welcome";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("fl_oauth_state")?.value;
  const error = url.searchParams.get("error");

  if (error) return NextResponse.redirect(new URL(`/?auth=error&reason=${error}`, req.url));
  if (!code) return NextResponse.redirect(new URL("/?auth=error&reason=no_code", req.url));
  if (!state || state !== cookieState) {
    return NextResponse.redirect(new URL("/?auth=error&reason=bad_state", req.url));
  }

  try {
    const tokens = await exchangeCode(code);
    const profile = await fetchProfile(tokens.access_token);

    const session: Session = {
      sub: profile.sub,
      name: profile.name,
      email: profile.email,
      picture: profile.picture,
      brandVoice: "warm_local",
      createdAt: Date.now(),
    };

    // Provision THIS user's own workspace (a per-user agent id derived from the
    // Google subject) so each signed-in user is an isolated tenant — never the
    // shared demo agent. Every composed draft is "from" them.
    const agentId = agentIdForSub(profile.sub);
    const repo = await getRepo();
    const existing = await repo.getAgent(agentId);
    await provisionWorkspace(repo, {
      id: agentId,
      name: profile.name,
      email: profile.email,
      signatureHtml: `<p>${profile.name} · ${profile.email}</p>`,
      brandVoice: existing?.brandVoice ?? "warm_local",
      locale: existing?.locale ?? "en-US",
      mode: existing?.mode ?? "crm",
    });
    session.googleCredentialRef = await saveGoogleCredential(agentId, tokens);

    if (!config.founder.sub && profile.email.toLowerCase() === config.founder.email.toLowerCase()) {
      log("info", "founder.bootstrap_candidate", {
        email: profile.email,
        sub: profile.sub,
      });
    }

    // New user with no phone yet → send them through a one-field onboarding.
    const dest = session.phone ? "/app?auth=ok" : "/app?auth=ok&onboard=phone";
    const res = NextResponse.redirect(new URL(dest, req.url));
    res.cookies.set(SESSION_COOKIE, seal(session), sessionCookieOptions());
    res.cookies.delete("fl_oauth_state");
    void sendWelcomeEmail({
      agentId,
      email: profile.email,
      name: profile.name,
      accessToken: tokens.access_token,
    });
    return res;
  } catch (e) {
    const reason = encodeURIComponent(e instanceof Error ? e.message : "exchange_failed");
    return NextResponse.redirect(new URL(`/?auth=error&reason=${reason}`, req.url));
  }
}
