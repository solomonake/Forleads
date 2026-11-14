import { NextResponse } from "next/server";
import { config, coreLiveModeViolations } from "@/lib/core/config";
import {
  capabilityReport,
  degradedCapabilities,
  effectiveMode,
  type CapabilityReport,
} from "@/lib/core/capabilities";
import { getRepo } from "@/lib/db";
import { assertSupabaseSchema } from "@/lib/db/supabase-health";
import { withRoute } from "@/lib/observability";

export const dynamic = "force-dynamic";

// `modes` keeps its old keys, but each value is now the effective mode: a path
// configured "live" without its key reports "configured_no_key", not "live".
// `capabilities` carries the detail (presence booleans only, never values),
// `degraded` lists what was asked for but can't run. `ok` keeps its meaning:
// no mock provider in production, and the persistence read path works.
function body(report: CapabilityReport) {
  return {
    productionPolicy: {
      mockConnectorWritesAllowed: config.allowMockConnectorWrites,
      liveModeViolations: coreLiveModeViolations(),
    },
    modes: {
      persistence: effectiveMode(report.persistence),
      geocoder: effectiveMode(report.geocoder),
      property: effectiveMode(report.property),
      imagery: effectiveMode(report.imagery),
      agent: effectiveMode(report.agent),
    },
    capabilities: report,
    degraded: degradedCapabilities(report),
  };
}

export const GET = withRoute("health", async () => {
  const report = await capabilityReport();
  try {
    const repo = await getRepo();
    await repo.listLeads("00000000-0000-0000-0000-000000000001");
    await assertSupabaseSchema();
    const liveModeViolations = coreLiveModeViolations();
    return NextResponse.json(
      { ok: liveModeViolations.length === 0, ...body(report) },
      { status: liveModeViolations.length === 0 ? 200 : 503 },
    );
  } catch (error) {
    console.error("[forleads] health check failed", error);
    return NextResponse.json(
      { ok: false, error: "persistence unavailable", ...body(report) },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
});
