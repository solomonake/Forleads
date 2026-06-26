import { NextRequest, NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { log, withRoute } from "@/lib/observability";
import { runScheduledLoops } from "@/lib/loops/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = withRoute("cron.loops", async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "scheduled loops are not configured" },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runScheduledLoops(await getRepo(), { maxRuns: 25 });
  log("info", "cron.loops.completed", { ...summary });
  return NextResponse.json({ ok: summary.errors === 0, summary });
});
