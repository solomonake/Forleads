import type { EvidenceCard } from "@/lib/core/types";

export interface VisionInput {
  frameUrls: string[];
  frameIds: string[];
  address: string;
  lng: number;
  lat: number;
}

export interface VisionCaptioner {
  readonly name: string;
  readonly mode: "mock" | "live";
  caption(input: VisionInput): Promise<EvidenceCard[]>;
}
