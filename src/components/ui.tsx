"use client";

import type { Confidence } from "@/lib/core/types";

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

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return (await res.json()) as T;
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  return apiWrite<T>("POST", url, body);
}

export async function apiPatch<T>(url: string, body: unknown): Promise<T> {
  return apiWrite<T>("PATCH", url, body);
}

async function apiWrite<T>(method: "POST" | "PATCH", url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `${method} ${url} → ${res.status}`);
  return data;
}
