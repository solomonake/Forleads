import { NextRequest, NextResponse } from "next/server";
import { ensureCurrentAgent } from "@/lib/auth/agent";
import { config } from "@/lib/core/config";
import { nowISO, uuid } from "@/lib/core/ids";
import type { Artifact, EmailPayload, LeadSurface } from "@/lib/core/types";
import { getRepo } from "@/lib/db";
import { DEMO_AGENT } from "@/lib/db/seed";
import { lintArtifactText } from "@/lib/agents/compliance";
import { buildTrace } from "@/lib/agents/trace";
import { composeSellerUpdateBest } from "@/lib/agents/seller-update.live";
import {
  sellerUpdateEvidence,
  summarizeShowingFeedback,
  type SellerUpdateSummary,
} from "@/lib/agents/seller-update";
import { withRoute } from "@/lib/observability";
import { emit } from "@/lib/pipeline";
import { enforceRateLimit } from "@/lib/ratelimit";
import { optNum, str, validateBody, ValidationError } from "@/lib/validation";

const SELLER_STATUSES = new Set<LeadSurface["status"]>(["appointment", "won"]);
const DEFAULT_WINDOW_DAYS = 14;

function readWindowDays(value: number | undefined): number {
  if (value === undefined) return DEFAULT_WINDOW_DAYS;
  if (!Number.isInteger(value)) throw new ValidationError("windowDays must be an integer");
  if (value < 1 || value > 60) throw new ValidationError("windowDays must be between 1 and 60");
  return value;
}

function textParts(payload: unknown): string[] {
  const p = payload as Record<string, unknown>;
  return ["subject", "body", "title", "notes"].flatMap((field) =>
    typeof p[field] === "string" ? [String(p[field])] : [],
  );
}

function isSellerUpdateArtifact(artifact: Artifact, listingId: string): boolean {
  const payload = artifact.payload as Partial<EmailPayload>;
  return (
    artifact.lead_surface_id === listingId &&
    artifact.type === "email" &&
    artifact.model_trace.promptVersion.startsWith("seller-update:") &&
    typeof payload.subject === "string"
  );
}

async function loadTenantListing(listingId: string, agentId: string) {
  const repo = await getRepo();
  const listing = await repo.getLead(listingId);
  if (!listing || listing.agent_id !== agentId) return { repo, listing: null };
  return { repo, listing };
}

export const POST = withRoute("seller-update.post", async (req: NextRequest) => {
  const body = await validateBody(req, (b) => ({
    listingId: str(b, "listingId", { max: 100 }),
    windowDays: readWindowDays(optNum(b, "windowDays")),
  }));
  const agentId = await ensureCurrentAgent();
  if (!agentId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const limited = enforceRateLimit(req, { name: "compose", agentId, perAgent: 10, perIp: 15 });
  if (limited) return limited;

  const { repo, listing } = await loadTenantListing(body.listingId, agentId);
  if (!listing) return NextResponse.json({ error: "listing not found" }, { status: 404 });
  if (!SELLER_STATUSES.has(listing.status)) {
    return NextResponse.json({ error: "listing required" }, { status: 422 });
  }

  const notes = await repo.listNotes(listing.id);
  const summary = summarizeShowingFeedback(notes, { windowDays: body.windowDays });
  if (summary.themes.length === 0) {
    return NextResponse.json({
      noUpdate: true,
      reason: "no in-window feedback",
      themes: summary.themes,
      showingsCounted: summary.showingsCounted,
      windowDays: summary.windowDays,
    });
  }

  const agent = (await repo.getAgent(agentId)) ?? DEMO_AGENT;
  const evidence = sellerUpdateEvidence(summary, listing.id);
  const composed = await composeSellerUpdateBest({
    agent,
    situation: "interested_seller",
    actionType: "email",
    address: listing.address,
    recipientLabel: listing.contact?.name ?? `Seller · ${listing.address}`,
    recipientEmail: listing.contact?.email,
    evidence,
    sellerUpdate: {
      themes: summary.themes,
      showingsCounted: summary.showingsCounted,
      windowDays: summary.windowDays,
      noteIds: summary.noteIds,
      truncated: summary.truncated,
    },
  });
  const compliance = lintArtifactText(textParts(composed.payload));
  const artifactId = uuid();
  const traceId = uuid();
  const isLive = composed.promptVersion.startsWith("seller-update-live");
  const stamp = nowISO();
  const artifact: Artifact = {
    id: artifactId,
    agent_id: agentId,
    lead_surface_id: listing.id,
    type: "email",
    status: compliance.pass ? "drafted" : "blocked",
    payload: composed.payload,
    evidence_used: composed.evidenceUsed,
    compliance_result: compliance,
    model_trace: {
      model: isLive ? config.claudeModel : "deterministic-seller-update",
      promptVersion: `seller-update:${composed.promptVersion}`,
      mode: isLive ? "live" : "mock",
      tokens: composed.modelUsage
        ? composed.modelUsage.inputTokens + composed.modelUsage.outputTokens
        : undefined,
    },
    trace_id: traceId,
    revision: 1,
    created_at: stamp,
    updated_at: stamp,
  };
  await repo.saveArtifact(artifact);

  const trace = buildTrace({
    agentId,
    artifact,
    trigger: "seller_update.requested",
    situation: "seller_update",
    situationConfidence: summary.themes.some((theme) => theme.confidence === "A") ? 0.92 : 0.84,
    evidenceUsed: composed.evidenceUsed,
    excluded: composed.excluded,
    compliance,
    cost: {
      claudeCalls: isLive ? 1 : 0,
      paidDataCalls: 0,
      ms: 0,
      inputTokens: composed.modelUsage?.inputTokens,
      outputTokens: composed.modelUsage?.outputTokens,
      cacheReadTokens: composed.modelUsage?.cacheReadTokens,
      cacheWriteTokens: composed.modelUsage?.cacheWriteTokens,
      fallbackReason: composed.fallbackReason,
    },
  });
  trace.id = traceId;
  await repo.saveTrace(trace);

  await emit(
    agentId,
    "seller_update.drafted",
    {
      artifactId,
      traceId,
      listingId: listing.id,
      status: artifact.status,
      summary: summary satisfies SellerUpdateSummary,
    },
    "seller-update",
    listing.id,
  );

  return NextResponse.json(
    {
      artifactId,
      artifact,
      traceId,
      themes: summary.themes,
      showingsCounted: summary.showingsCounted,
      windowDays: summary.windowDays,
      truncated: summary.truncated,
    },
    { status: 201 },
  );
});

export const GET = withRoute("seller-update.get", async (req: NextRequest) => {
  const listingId = req.nextUrl.searchParams.get("listingId")?.trim();
  if (!listingId) return NextResponse.json({ error: "listingId is required" }, { status: 400 });
  const agentId = await ensureCurrentAgent();
  if (!agentId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const { repo, listing } = await loadTenantListing(listingId, agentId);
  if (!listing) return NextResponse.json({ error: "listing not found" }, { status: 404 });
  const artifact = (await repo.listArtifacts(agentId)).find((candidate) =>
    isSellerUpdateArtifact(candidate, listing.id),
  );
  if (!artifact) return NextResponse.json({ error: "seller update not found" }, { status: 404 });
  return NextResponse.json({ artifact });
});
