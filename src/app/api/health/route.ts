import { NextResponse } from "next/server";
import { config } from "@/lib/core/config";
import { getRepo } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const repo = await getRepo();
    await repo.listLeads("00000000-0000-0000-0000-000000000001");
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
      { status: 503 },
    );
  }
}
