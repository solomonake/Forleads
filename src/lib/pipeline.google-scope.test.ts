import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyStore, InMemoryRepository } from "@/lib/db/repository";
import type { Agent, LeadSurface } from "@/lib/core/types";
const m=vi.hoisted(()=>({repo:undefined as unknown,routed:vi.fn()}));
vi.mock("@/lib/db",()=>({getRepo:async()=>m.repo}));
vi.mock("@/lib/connectors",()=>({connectorForAction:async()=>{m.routed();throw new Error("ROUTED_WITH_TEST_STUB");}}));
import { approveArtifact, draftArtifact } from "./pipeline";
const owner:Agent={id:"scope-owner",name:"Fixture",email:"fixture@example.com",signatureHtml:"",brandVoice:"warm_local",locale:"en-US",mode:"crm"};
const lead:LeadSurface={id:"scope-lead",agent_id:owner.id,address:"Synthetic scope fixture",lng:0,lat:0,h3_index:"fixture",status:"researching",contact:{email:"fixture@example.com"},first_seen_at:new Date().toISOString(),last_worked_at:new Date().toISOString()};
beforeEach(()=>{m.repo=new InMemoryRepository(emptyStore());m.routed.mockClear();});
async function artifact(type:"email"|"calendar"){
 const repo=m.repo as InMemoryRepository;await repo.upsertAgent(owner);await repo.upsertLead(lead);
 const a=await draftArtifact({agent:owner,lead,situation:"no_contact",situationConfidence:0.9,actionType:"email",evidence:[],trigger:"test"});
 await repo.updateArtifact(a.id,{type});return a;
}
describe("scope gate before connector routing",()=>{
 it("identity-only setup error wins over configured global token",async()=>{
  const old=process.env.GOOGLE_ACCESS_TOKEN;process.env.GOOGLE_ACCESS_TOKEN="global-fixture";
  try { const a=await artifact("email");await expect(approveArtifact(a.id,a.revision,{agentId:owner.id,googleCredentialError:"Connect Google Workspace"})).rejects.toThrow("Connect Google Workspace");expect(m.routed).not.toHaveBeenCalled(); }
  finally{if(old===undefined)delete process.env.GOOGLE_ACCESS_TOKEN;else process.env.GOOGLE_ACCESS_TOKEN=old;}
 });
 it("Gmail-only grant passes email but blocks calendar before routing",async()=>{
  const opts={agentId:owner.id,googleAccessToken:"fixture",googleGrantedScope:"https://www.googleapis.com/auth/gmail.compose"};
  const a=await artifact("email");await expect(approveArtifact(a.id,a.revision,opts)).rejects.toThrow("ROUTED_WITH_TEST_STUB");expect(m.routed).toHaveBeenCalledTimes(1);
  m.routed.mockClear();const b=await artifact("calendar");await expect(approveArtifact(b.id,b.revision,opts)).rejects.toThrow("required Google permission");expect(m.routed).not.toHaveBeenCalled();
 });
 it("empty or reduced scope cannot use a refreshed access token",async()=>{
  const a=await artifact("email");await expect(approveArtifact(a.id,a.revision,{agentId:owner.id,googleAccessToken:"refreshed",googleGrantedScope:"openid email profile"})).rejects.toThrow("required Google permission");expect(m.routed).not.toHaveBeenCalled();
 });
});
