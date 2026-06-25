"use client";

import type { Confidence } from "@/lib/core/types";

export { ApiError, apiGet, apiPatch, apiPost } from "./api";

export function GradeChip({ grade }: { grade: Confidence }) {
  return (
    <span className={`chip g${grade}`}>
      <span className="d" />
      {grade}
    </span>
  );
}

export function ConfidenceLegend() {
  const items: { g: Confidence; label: string }[] = [
    { g: "A", label: "Verified" },
    { g: "B", label: "Modeled" },
    { g: "C", label: "Sparse" },
    { g: "D", label: "Unverified" },
  ];
  return (
    <div className="legend">
      {items.map((i) => (
        <span className="li" key={i.g}>
          <GradeChip grade={i.g} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
