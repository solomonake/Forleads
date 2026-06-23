// GET /api/geocode?q=... — address autocomplete via the configured geocoder
// (mock gazetteer by default; Photon when self-hosted).
import { NextRequest, NextResponse } from "next/server";
import { getGeocodeProvider } from "@/lib/providers";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const provider = getGeocodeProvider();
  const results = await provider.autocomplete(q, 6);
  return NextResponse.json({ results, provider: provider.name, mode: provider.mode });
}
