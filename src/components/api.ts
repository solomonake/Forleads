// Shared client API helpers live outside TSX so Node-based tests can exercise
// request/error behavior without loading the React transform pipeline.
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
  const headerReqId = res.headers.get("x-request-id") ?? undefined;
  let data: (T & { error?: string; requestId?: string }) | null = null;
  try {
    data = (await res.json()) as T & { error?: string; requestId?: string };
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = data?.error ?? `${label} → ${res.status}`;
    throw new ApiError(message, res.status, data?.requestId ?? headerReqId);
  }
  return data as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return parseApiResponse<T>(res, `GET ${url}`);
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  return apiWrite<T>("POST", url, body);
}

export async function apiPatch<T>(url: string, body: unknown): Promise<T> {
  return apiWrite<T>("PATCH", url, body);
}

async function apiWrite<T>(
  method: "POST" | "PATCH",
  url: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<T>(res, `${method} ${url}`);
}
