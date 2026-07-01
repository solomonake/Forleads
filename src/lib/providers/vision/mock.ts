import type { EvidenceCard } from "@/lib/core/types";
import type { VisionCaptioner, VisionInput } from "./types";

function seeded(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MockVisionCaptioner implements VisionCaptioner {
  readonly name = "mock-vision";
  readonly mode = "mock" as const;

  async caption(input: VisionInput): Promise<EvidenceCard[]> {
    const rng = seeded(`${input.address}:vision`);
    const options = [
      {
        claim: "Style (vision)",
        value: "Detached exterior with simple massing",
      },
      {
        claim: "Roof form (vision)",
        value: "Pitched roof visible from the street",
      },
      {
        claim: "Landscaping (vision)",
        value: "Mature planting at the front edge",
      },
      {
        claim: "Stories (vision)",
        value: "Two stories visible from facade proportions",
      },
    ];

    return options.slice(0, 2 + Math.floor(rng() * 2)).map((item) => ({
      scout: "imagery",
      claim: item.claim,
      value: item.value,
      sources: [
        ...input.frameIds.slice(0, 3).map((id, index) => ({
          name: `Mapillary frame ${id}`,
          url: input.frameUrls[index],
        })),
        { name: "Imagery Scout · mock vision" },
      ],
      confidence: "C",
      reasoning: "Deterministic mock caption from visible exterior imagery only.",
    }));
  }
}
