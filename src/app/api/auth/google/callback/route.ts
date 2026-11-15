// GET /api/auth/google/callback — exchange the code, capture the user's profile
// (name/email/picture) + Gmail/Calendar tokens, seal them into the session
// cookie, and bind the agent identity so drafts come from the real user.
import { NextRequest, NextResponse } from "next/server";
import { agentIdForSub } from "@/lib/auth/agent";
import { exchangeCode, fetchProfile, hasGoogleConnectorScopes } from "@/lib/auth/google";
import { SESSION_COOKIE, seal, sessionCookieOptions, getSession, unsealValue, type Session } from "@/lib/auth/session";
import { getRepo } from "@/lib/db";
import { provisionWorkspace } from "@/lib/db/seed";
import { saveGoogleCredential, loadGoogleCredential } from "@/lib/auth/credentials";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const context = unsealValue<{ state: string; intent: "signin" | "connect"; sub?: string; expiresAt: number }>(req.cookies.get("fl_oauth_state")?.value ?? "");
  const finish = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/?auth=error&reason=${encodeURIComponent(reason)}`, req.url));
    res.cookies.delete("fl_oauth_state");
    return res;
  };
  if (!context || !state || state !== context.state || !["signin", "connect"].includes(context.intent) || !Number.isFinite(context.expiresAt) || context.expiresAt < Date.now()) return finish("bad_state");
  const error = url.searchParams.get("error");
  if (error) return finish(error);
  if (!code) return finish("no_code");
  const previous = await getSession();
  if (context.intent === "connect" && (!previous || previous.sub !== context.sub)) return finish("account_changed");

  try {
    const tokens = await exchangeCode(code);
    const profile = await fetchProfile(tokens.access_token);

    if (context.intent === "connect" && profile.sub !== context.sub) return finish("account_changed");
    if (context.intent === "connect" && !hasGoogleConnectorScopes(tokens.scope)) return finish("missing_connector_permissions");
    const sameUser = previous?.sub === profile.sub ? previous : undefined;
    const session: Session = {
      ...sameUser,
      sub: profile.sub,
      name: profile.name,
      email: profile.email,
      picture: profile.picture,
      brandVoice: sameUser?.brandVoice ?? "warm_local",
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
    // Identity-only login never stores its token over an existing connector grant.
    // An existing grant can be reattached only after proving the same Google sub.
    if (context.intent === "connect") {
      const oldTokens = sameUser?.googleCredentialRef
        ? await loadGoogleCredential(agentId, sameUser.googleCredentialRef) : sameUser?.google;
      session.googleCredentialRef = await saveGoogleCredential(agentId,
        { ...tokens, refresh_token: tokens.refresh_token ?? oldTokens?.refresh_token },
        sameUser?.googleCredentialRef);
      session.google = undefined;
    } else if (!session.googleCredentialRef && !session.google) {
      const existingGrant = await repo.findConnectorCredential(agentId, "google");
      if (existingGrant) session.googleCredentialRef = existingGrant.id;
    }

    // New user with no phone yet → send them through a one-field onboarding.
    const dest = session.phone ? "/?auth=ok" : "/?auth=ok&onboard=phone";
    const res = NextResponse.redirect(new URL(dest, req.url));
    res.cookies.set(SESSION_COOKIE, seal(session), sessionCookieOptions());
    res.cookies.delete("fl_oauth_state");
    return res;
  } catch {
    return finish("exchange_failed");
  }
}
