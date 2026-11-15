import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "@/lib/auth/session";
const m = vi.hoisted(() => ({
  session: null as Session | null,
  profile: { sub: "A", email: "a@example.com", name: "Fixture" },
  scope: "", save: vi.fn(), provision: vi.fn(), old: { access_token: "old", refresh_token: "keep", scope: "https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events", expiry: 9999999999999 },
}));
vi.mock("@/lib/auth/session", async original => ({ ...await original<typeof import("@/lib/auth/session")>(), getSession: async () => m.session }));
vi.mock("@/lib/auth/google", async original => ({ ...await original<typeof import("@/lib/auth/google")>(), exchangeCode: async () => ({access_token:"fresh", expiry:9999999999999, scope:m.scope}), fetchProfile: async () => m.profile }));
vi.mock("@/lib/auth/agent", () => ({ agentIdForSub: (sub: string) => `agent-${sub}` }));
vi.mock("@/lib/db", () => ({ getRepo: async () => ({ getAgent: async () => null, findConnectorCredential: async () => ({id:"existing-grant"}) }) }));
vi.mock("@/lib/db/seed", () => ({ provisionWorkspace: m.provision }));
vi.mock("@/lib/auth/credentials", () => ({ saveGoogleCredential: m.save, loadGoogleCredential: async () => m.old }));
import { GET } from "./route";
import { sealValue, unseal, SESSION_COOKIE } from "@/lib/auth/session";
function req(intent: "signin" | "connect" = "signin", query = "code=fixture&state=csrf", expired = false) {
  const cookie = sealValue({state:"csrf",intent,sub:intent === "connect" ? "A":undefined,expiresAt: Date.now()+(expired?-1000:600000)});
  return new NextRequest(`http://localhost/api/auth/google/callback?${query}`, {headers:{cookie:`fl_oauth_state=${cookie}`}});
}
const current = (): Session => ({sub:"A", name:"Old",email:"a@example.com",createdAt:1,phone:"fixture",brandVoice:"crisp_pro",googleCredentialRef:"existing-grant"});
beforeEach(() => {m.session=null;m.profile.sub="A";m.scope=m.old.scope;m.save.mockReset();m.save.mockResolvedValue("saved");m.provision.mockClear();});
describe("Google callback separation", () => {
  it("identity-only login reattaches existing grant without storing identity tokens", async () => {
    m.scope="openid email profile";
    const res = await GET(req());const session=unseal(res.cookies.get(SESSION_COOKIE)!.value)!;
    expect(session.sub).toBe("A");expect(session.googleCredentialRef).toBe("existing-grant");expect(m.save).not.toHaveBeenCalled();
  });
  it("same-user sign-in preserves phone, voice and connector reference", async () => {
    m.session=current();const res=await GET(req());const s=unseal(res.cookies.get(SESSION_COOKIE)!.value)!;
    expect(s).toMatchObject({phone:"fixture",brandVoice:"crisp_pro",googleCredentialRef:"existing-grant"});expect(m.save).not.toHaveBeenCalled();
  });
  it("explicit connect keeps the previous refresh token when Google omits it", async () => {
    m.session=current(); await GET(req("connect")); expect(m.save).toHaveBeenCalledWith("agent-A",expect.objectContaining({refresh_token:"keep"}),"existing-grant");
  });
  it("partial consent leaves the old connector grant untouched", async () => {
    m.session=current();m.scope="openid email profile";
    const res=await GET(req("connect"));expect(res.headers.get("location")).toContain("missing_connector_permissions");expect(m.save).not.toHaveBeenCalled();expect(m.provision).not.toHaveBeenCalled();
  });
  it("rejects changed session or Google account before saving", async () => {
    m.session={...current(),sub:"B"};expect((await GET(req("connect"))).headers.get("location")).toContain("account_changed");
    m.session=current();m.profile.sub="B";expect((await GET(req("connect"))).headers.get("location")).toContain("account_changed");expect(m.save).not.toHaveBeenCalled();
  });
  it("cancel, mismatch and expiration clear state without changing credentials", async () => {
    for(const r of [req("signin","error=access_denied&state=csrf"),req("signin","code=x&state=wrong"),req("signin",undefined,true)]) {
      const res=await GET(r);expect(res.headers.get("location")).toContain("auth=error");expect(res.cookies.get("fl_oauth_state")?.value).toBe("");
    }
    expect(m.save).not.toHaveBeenCalled();
  });
});
