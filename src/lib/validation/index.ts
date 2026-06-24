// ============================================================================
// Input validation — typed, size-bounded request parsing at the edge (audit
// axis 7). Replaces unchecked `(await req.json()) as {...}` casts so malformed,
// oversized, or wrong-typed payloads are rejected with a 400 BEFORE reaching the
// pipeline. Deps-free (the schemas here are small; not worth a runtime dep).
//
// A ValidationError carries `status = 400`; the `withRoute` error boundary maps
// any thrown error with a numeric `.status` to that code, so a validation
// failure becomes a clean 400 with the field message — no per-route try/catch.
// ============================================================================

export class ValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const MAX_BODY_BYTES = 16 * 1024; // 16 KB — generous for notes/drafts, caps abuse.

/** Read + parse a JSON body with a hard size cap. Throws ValidationError (400). */
export async function parseJsonBody(req: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) {
    throw new ValidationError(`request body too large (max ${maxBytes} bytes)`);
  }
  if (!text.trim()) throw new ValidationError("request body required");
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("invalid JSON body");
  }
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

// ---- Field validators -------------------------------------------------------

export function str(
  body: Record<string, unknown>,
  field: string,
  opts: { max?: number } = {},
): string {
  const v = body[field];
  if (typeof v !== "string" || v.trim() === "") {
    throw new ValidationError(`${field} is required and must be a non-empty string`);
  }
  if (opts.max && v.length > opts.max) {
    throw new ValidationError(`${field} exceeds max length ${opts.max}`);
  }
  return v;
}

export function num(body: Record<string, unknown>, field: string): number {
  const v = body[field];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ValidationError(`${field} is required and must be a finite number`);
  }
  return v;
}

export function optNum(
  body: Record<string, unknown>,
  field: string,
  opts: { min?: number; max?: number } = {},
): number | undefined {
  const v = body[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ValidationError(`${field} must be a finite number`);
  }
  if (opts.min !== undefined && v < opts.min) throw new ValidationError(`${field} must be >= ${opts.min}`);
  if (opts.max !== undefined && v > opts.max) throw new ValidationError(`${field} must be <= ${opts.max}`);
  return v;
}

export function oneOf<T extends string>(
  body: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T {
  const v = body[field];
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return v as T;
}

export function optStr<T extends string = string>(
  body: Record<string, unknown>,
  field: string,
  opts: { max?: number; allowed?: readonly T[] } = {},
): T | undefined {
  const v = body[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new ValidationError(`${field} must be a string`);
  if (opts.max && v.length > opts.max) throw new ValidationError(`${field} exceeds max length ${opts.max}`);
  if (opts.allowed && !opts.allowed.includes(v as T)) {
    throw new ValidationError(`${field} must be one of: ${opts.allowed.join(", ")}`);
  }
  return v as T;
}

/** Parse a request body into a validated object via a field-reader callback. */
export async function validateBody<T>(
  req: Request,
  read: (b: Record<string, unknown>) => T,
): Promise<T> {
  return read(asRecord(await parseJsonBody(req)));
}
