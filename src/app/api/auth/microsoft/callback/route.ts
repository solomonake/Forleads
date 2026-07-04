// GET /api/auth/microsoft/callback — exchange code, seal MicrosoftTokens into
// the per-tenant connector_credential row for provider="microsoft". No global
// session change; this is a secondary connect for an already signed-in agent.
import { NextRequest, NextResponse } from "next/server";
import { requireAgentId } from "@/lib/auth/agent";
import { saveTenantCredential } from "@/lib/auth/credentials";
import { exchangeCode, fetchProfile } from "@/lib/auth/microsoft";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("fl_ms_oauth_state")?.value;
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/?connect=microsoft&status=error&reason=${encodeURIComponent(error)}`, req.url),
    );
  }
  if (!code || !state || state !== cookieState) {
    return NextResponse.redirect(new URL("/?connect=microsoft&status=bad_state", req.url));
  }

  const agentId = await requireAgentId();
  if (!agentId) {
    return NextResponse.redirect(new URL("/?connect=microsoft&status=login_required", req.url));
  }

  try {
    const tokens = await exchangeCode(code);
    const profile = await fetchProfile(tokens.access_token);
    await saveTenantCredential(agentId, "microsoft", {
      ...tokens,
      profile: { sub: profile.sub, name: profile.name, email: profile.email },
    });
    const dest = `/?connect=microsoft&status=ok&as=${encodeURIComponent(profile.email)}`;
    const res = NextResponse.redirect(new URL(dest, req.url));
    res.cookies.delete("fl_ms_oauth_state");
    return res;
  } catch (e) {
    const reason = encodeURIComponent(e instanceof Error ? e.message : "exchange_failed");
    return NextResponse.redirect(
      new URL(`/?connect=microsoft&status=error&reason=${reason}`, req.url),
    );
  }
}
