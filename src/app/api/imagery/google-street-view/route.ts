import { NextRequest, NextResponse } from "next/server";
import { readAgentId } from "@/lib/auth/agent";
import { config } from "@/lib/core/config";
import { withRoute } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/ratelimit";

interface StreetViewMetadata {
  status?: string;
}

function coordinate(req: NextRequest, key: "lat" | "lng"): number | null {
  const raw = req.nextUrl.searchParams.get(key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (key === "lat" && (value < -90 || value > 90)) return null;
  if (key === "lng" && (value < -180 || value > 180)) return null;
  return value;
}

export const GET = withRoute("google-street-view-image", async (req: NextRequest) => {
  const agentId = await readAgentId();
  const limited = enforceRateLimit(req, {
    name: "google-street-view-image",
    agentId,
    perAgent: 60,
    perIp: 120,
  });
  if (limited) return limited;

  const lat = coordinate(req, "lat");
  const lng = coordinate(req, "lng");
  if (lat === null || lng === null) {
    return NextResponse.json({ error: "valid lat/lng required" }, { status: 400 });
  }
  if (!config.googleMapsKey) {
    return NextResponse.json({ error: "Google Street View is not configured" }, { status: 503 });
  }

  const metadataUrl = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  metadataUrl.searchParams.set("location", `${lat},${lng}`);
  metadataUrl.searchParams.set("radius", "50");
  metadataUrl.searchParams.set("source", "outdoor");
  metadataUrl.searchParams.set("key", config.googleMapsKey);

  const metadataRes = await fetch(metadataUrl, {
    headers: {
      "User-Agent": "Forleads/1.0 (google street-view image proxy; +https://forleads.vercel.app)",
      Accept: "application/json",
    },
  });
  if (!metadataRes.ok) {
    return NextResponse.json({ error: "Street View metadata unavailable" }, { status: 502 });
  }
  const metadata = (await metadataRes.json()) as StreetViewMetadata;
  if (metadata.status !== "OK") {
    return NextResponse.json({ error: "No Street View image at this point" }, { status: 404 });
  }

  const imageUrl = new URL("https://maps.googleapis.com/maps/api/streetview");
  imageUrl.searchParams.set("location", `${lat},${lng}`);
  imageUrl.searchParams.set("size", "640x480");
  imageUrl.searchParams.set("radius", "50");
  imageUrl.searchParams.set("source", "outdoor");
  imageUrl.searchParams.set("fov", "80");
  imageUrl.searchParams.set("pitch", "0");
  imageUrl.searchParams.set("return_error_code", "true");
  imageUrl.searchParams.set("key", config.googleMapsKey);

  const imageRes = await fetch(imageUrl, {
    headers: {
      "User-Agent": "Forleads/1.0 (google street-view image proxy; +https://forleads.vercel.app)",
      Accept: "image/jpeg,image/*;q=0.9",
    },
  });
  if (!imageRes.ok) {
    return NextResponse.json({ error: "Street View image unavailable" }, { status: 502 });
  }

  return new NextResponse(await imageRes.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": imageRes.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
});
