import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m=vi.hoisted(()=>({session:null as {sub:string}|null}));
vi.mock("@/lib/auth/session",async original=>({...await original<typeof import("@/lib/auth/session")>(),getSession:async()=>m.session}));
vi.mock("@/lib/auth/google",async original=>({...await original<typeof import("@/lib/auth/google")>(),googleConfigured:()=>true}));
import { GET } from "./route";
import { unsealValue } from "@/lib/auth/session";
describe("Google login intent binding",()=>{
 it("defaults to identity only with signed expiring state",async()=>{m.session=null;const r=await GET(new NextRequest("http://localhost/api/auth/google/login"));const url=new URL(r.headers.get("location")!);expect(url.searchParams.get("scope")).toBe("openid email profile");expect(unsealValue(r.cookies.get("fl_oauth_state")!.value)).toMatchObject({state:url.searchParams.get("state"),intent:"signin"});});
 it("requires sign-in before connector consent",async()=>{m.session=null;const r=await GET(new NextRequest("http://localhost/api/auth/google/login?connect=1"));expect(r.headers.get("location")).toContain("login_required");expect(r.cookies.get("fl_oauth_state")).toBeUndefined();});
 it("binds connector consent to the current account",async()=>{m.session={sub:"A"};const r=await GET(new NextRequest("http://localhost/api/auth/google/login?connect=1"));expect(unsealValue(r.cookies.get("fl_oauth_state")!.value)).toMatchObject({intent:"connect",sub:"A"});});
});
