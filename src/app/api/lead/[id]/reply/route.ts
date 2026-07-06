// POST /api/lead/[id]/reply — the operator logs that the contact replied to
// an approved outreach email. This (1) records the email.reply event that
// analytics, the weekly report, and the reply-watch bump loop key off, and
// (2) fires any event-driven loops listening for email.reply so the response
// draft is prepared immediately. Draft-first as always: nothing sends.

import { NextRequest, NextResponse } from "next/server";
import { ensureCurrentAgent } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/ratelimit";
import { optStr, validateBody } from "@/lib/validation";
import { getRepo } from "@/lib/db";
import { emit } from "@/lib/pipeline";
import { matchLoops, runLoop } from "@/lib/loops/engine";
import type { LoopRun, Situation } from "@/lib/core/types";

const SENTIMENTS = ["positive", "neutral", "negative"] as const;
type Sentiment = (typeof SENTIMENTS)[number];

const SITUATION_FOR: Record<Sentiment, Situation> = {
  positive: "interested_seller",
  neutral: "unknown",
  negative: "dead_not_now",
};

const replyPost = withRoute<{ params: { id: string } }>(
  "lead.reply",
  async (req: NextRequest, { params }) => {
    const { id } = params;
    const body = await validateBody(req, (b) => ({
      sentiment: optStr<Sentiment>(b, "sentiment", { allowed: SENTIMENTS }),
    }));

    const agentId = await ensureCurrentAgent();
    if (!agentId) {
      return NextResponse.json({ error: "authentication required" }, { status: 401 });
    }
    const limited = enforceRateLimit(req, {
      name: "lead.reply",
      agentId,
      perAgent: 60,
      perIp: 90,
    });
    if (limited) return limited;

    const repo = await getRepo();
    const lead = await repo.getLead(id);
    if (!lead || lead.agent_id !== agentId) {
      return NextResponse.json({ error: "lead not found" }, { status: 404 });
    }

    const sentiment: Sentiment = body.sentiment ?? "neutral";
    await emit(agentId, "email.reply", { sentiment }, "operator", lead.id);

    // Fire event-driven loops listening for email.reply (draft-first).
    const [defs, evidence, artifacts, events] = await Promise.all([
      repo.listLoopDefs(agentId),
      repo.listEvidence(lead.id),
      repo.listArtifacts(agentId),
      repo.listEvents(agentId),
    ]);
    const matched = matchLoops(defs, "email.reply", { sentiment });
    const runs: LoopRun[] = [];
    for (const def of matched) {
      runs.push(
        await runLoop(def, {
          lead,
          situation: SITUATION_FOR[sentiment],
          situationConfidence: 0.8,
          evidence,
          triggerSource: "reply-logged",
          artifacts,
          events,
        }),
      );
    }

    return NextResponse.json({
      logged: true,
      runs,
      preparedCount: runs.reduce((sum, run) => sum + run.artifact_ids.length, 0),
    });
  },
);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return replyPost(req, { params: await context.params });
}
