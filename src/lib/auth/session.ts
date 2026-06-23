// ============================================================================
// Encrypted session — stateless auth for Vercel. The user's profile + Google
// tokens live in an AES-256-GCM encrypted, httpOnly, secure cookie so real
// Gmail drafts work serverlessly with NO database. Secrets never reach the
// client (the cookie is opaque ciphertext; only the server can read it).
// ============================================================================

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "fl_session";
const ALG = "aes-256-gcm";

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expiry: number; // epoch ms when access_token expires
  scope: string;
}

export interface Session {
  sub: string; // Google user id
  name: string;
  email: string;
  picture?: string;
  phone?: string;
  brandVoice?: "warm_local" | "crisp_pro" | "luxury";
  google?: GoogleTokens;
  createdAt: number;
}

function key(): Buffer {
  const secret =
    process.env.SESSION_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    // Dev fallback — set SESSION_SECRET in production (a warning is logged once).
    "forleads-dev-insecure-session-secret-change-me";
  if (
    !process.env.SESSION_SECRET &&
    process.env.NODE_ENV === "production" &&
    !globalThis.__flSecretWarned
  ) {
    globalThis.__flSecretWarned = true;
    console.warn("[forleads] SESSION_SECRET not set — using an insecure default. Set it in Vercel env.");
  }
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

export function seal(session: Session): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, data]).toString("base64url");
}

export function unseal(token: string): Session | null {
  try {
    const raw = Buffer.from(token, "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = createDecipheriv(ALG, key(), iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(out.toString("utf8")) as Session;
  } catch {
    return null; // tampered or wrong key → treat as logged out
  }
}

// ---- Next.js cookie helpers (server components / route handlers) ------------

export function getSession(): Session | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return token ? unseal(token) : null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __flSecretWarned: boolean | undefined;
}
