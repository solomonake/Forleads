// GET /api/geocode?q=... — address autocomplete via the configured geocoder
// (mock gazetteer by default; Photon when self-hosted).
import { NextRequest, NextResponse } from "next/server";
import { withRoute } from "@/lib/observability";
import { getGeocodeProvider } from "@/lib/providers";

export const dynamic = "force-dynamic";

export const GET = withRoute("geocode", async (req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const provider = getGeocodeProvider();
  const results = await provider.autocomplete(q, 6);
  return NextResponse.json({ results, provider: provider.name, mode: provider.mode });
});
