import { NextResponse } from "next/server";
import { config } from "@/lib/core/config";
import { getRepo } from "@/lib/db";
import { assertSupabaseSchema } from "@/lib/db/supabase-health";
import { withRoute } from "@/lib/observability";

export const dynamic = "force-dynamic";

export const GET = withRoute("health", async () => {
  try {
    const repo = await getRepo();
    await repo.listLeads("00000000-0000-0000-0000-000000000001");
    await assertSupabaseSchema();
    return NextResponse.json({
      ok: true,
      modes: {
        persistence: config.persist,
        geocoder: config.geocoder,
        property: config.propertyProvider,
        imagery: config.imageryProvider,
        agent: config.agentMode,
      },
    });
  } catch (error) {
    console.error("[forleads] health check failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "persistence unavailable",
        modes: {
          persistence: config.persist,
          geocoder: config.geocoder,
          property: config.propertyProvider,
          imagery: config.imageryProvider,
          agent: config.agentMode,
        },
      },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
});
