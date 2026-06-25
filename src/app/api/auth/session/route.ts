import { NextRequest, NextResponse } from "next/server";
import { agentIdForSub } from "@/lib/auth/agent";
import {
  getSession,
  seal,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { getRepo } from "@/lib/db";
import { withRoute } from "@/lib/observability";

export const dynamic = "force-dynamic";

export const GET = withRoute("auth.session.get", async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      sub: session.sub,
      name: session.name,
      email: session.email,
      picture: session.picture,
      phone: session.phone ?? null,
      brandVoice: session.brandVoice ?? "warm_local",
      gmailConnected: Boolean(
        session.googleCredentialRef ||
        session.google?.refresh_token ||
        session.google?.access_token,
      ),
      scopes: session.google?.scope ?? "",
    },
  });
});

export const PATCH = withRoute("auth.session.patch", async (req: NextRequest) => {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  const body = (await req.json()) as { phone?: string; brandVoice?: string };
  if (typeof body.phone === "string") session.phone = body.phone.trim();
  if (
    body.brandVoice === "warm_local" ||
    body.brandVoice === "crisp_pro" ||
    body.brandVoice === "luxury"
  ) {
    session.brandVoice = body.brandVoice;
  }

  const repo = await getRepo();
  const agent = await repo.getAgent(agentIdForSub(session.sub));
  if (agent) {
    await repo.upsertAgent({
      ...agent,
      brandVoice: session.brandVoice ?? agent.brandVoice,
    });
  }

  const response = NextResponse.json({
    ok: true,
    user: { phone: session.phone, brandVoice: session.brandVoice },
  });
  response.cookies.set(SESSION_COOKIE, seal(session), sessionCookieOptions());
  return response;
});

export const DELETE = withRoute("auth.session.delete", async () => {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
});
