import { describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({scope:"",owner:"A"}));
vi.mock("./agent",()=>({agentIdForSub:(s:string)=>s}));
vi.mock("./credentials",()=>({loadGoogleCredential:async (agent:string)=>agent===m.owner?{access_token:"fixture",scope:m.scope}:null}));
import { googleGrant } from "./google-grant";
import { CONNECTOR_SCOPES } from "./google";
const session={sub:"A",email:"a@example.com",name:"Fixture",createdAt:1,googleCredentialRef:"ref"};
describe("Google scope readiness",()=>{
 it("identity-only and unknown credentials are disconnected",async()=>{m.scope="openid email profile";expect((await googleGrant(session)).connected).toBe(false);expect((await googleGrant(null)).connected).toBe(false);});
 it("partial grants report only the granted capability",async()=>{m.scope=CONNECTOR_SCOPES[0]!;expect(await googleGrant(session)).toMatchObject({gmail:true,calendar:false,connected:false});});
 it("complete grants connect only their owner",async()=>{m.scope=CONNECTOR_SCOPES.join(" ");expect((await googleGrant(session)).connected).toBe(true);expect((await googleGrant({...session,sub:"B"})).connected).toBe(false);});
});
