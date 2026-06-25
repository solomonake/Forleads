// /api/auth/session
//   GET    → current user (safe fields only; tokens never leave the server)
//   PATCH  → collect/update user info (phone, brand voice) — onboarding
//   DELETE → logout
import { NextRequest, NextResponse } from "next/server";
import { agentIdForSub } from "@/lib/auth/agent";
import {
  getSession,
  seal,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { getRepo } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = getSession();
  if (!s) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      sub: s.sub,
      name: s.name,
      email: s.email,
      picture: s.picture,
      phone: s.phone ?? null,
      brandVoice: s.brandVoice ?? "warm_local",
      gmailConnected: Boolean(s.google?.refresh_token || s.google?.access_token),
      scopes: s.google?.scope ?? "",
    },
  });
}

export async function PATCH(req: NextRequest) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const body = (await req.json()) as { phone?: string; brandVoice?: string };
  if (typeof body.phone === "string") s.phone = body.phone.trim();
  if (body.brandVoice === "warm_local" || body.brandVoice === "crisp_pro" || body.brandVoice === "luxury") {
    s.brandVoice = body.brandVoice;
  }

  // Persist the collected info onto the agent record too.
  const repo = await getRepo();
  const agent = await repo.getAgent(agentIdForSub(s.sub));
  if (agent) await repo.upsertAgent({ ...agent, brandVoice: s.brandVoice ?? agent.brandVoice });

  const res = NextResponse.json({ ok: true, user: { phone: s.phone, brandVoice: s.brandVoice } });
  res.cookies.set(SESSION_COOKIE, seal(s), sessionCookieOptions());
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
