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

// A typed failure that carries the request id from the server's withRoute()
// envelope so the UI can surface "incident 4f0334ea…" + a Retry CTA. Per
// [[accountability-show-failures]]: never hide an error behind a generic string.
export class ApiError extends Error {
  status: number;
  requestId?: string;
  constructor(message: string, status: number, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

async function parseApiResponse<T>(res: Response, label: string): Promise<T> {
  // The server's withRoute always sets x-request-id on success AND failure,
  // and includes `requestId` in the JSON body on failure. Prefer the body
  // value (set explicitly by the route) and fall back to the header.
  const headerReqId = res.headers.get("x-request-id") ?? undefined;
  // Some routes can legitimately return non-JSON (rate limiter HTML); guard.
  let data: (T & { error?: string; requestId?: string }) | null = null;
  try {
    data = (await res.json()) as T & { error?: string; requestId?: string };
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.error ?? `${label} → ${res.status}`;
    throw new ApiError(msg, res.status, data?.requestId ?? headerReqId);
  }
  return data as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return parseApiResponse<T>(res, `GET ${url}`);
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<T>(res, `POST ${url}`);
}
