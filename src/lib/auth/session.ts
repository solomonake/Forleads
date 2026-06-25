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
  googleCredentialRef?: string;
  /** Legacy sessions only; new OAuth callbacks store tokens server-side. */
  google?: GoogleTokens;
  createdAt: number;
}

function key(): Buffer {
  const secret = process.env.SESSION_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // FAIL CLOSED in production: an unset secret would sign sessions with a
    // public, repo-visible default — anyone could forge any session and bypass
    // the auth layer entirely. Refuse rather than silently run insecure. The
    // dev fallback stays only outside production so local dev/tests still work.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[forleads] SESSION_SECRET is required in production — refusing to fall back to an insecure default. Set it in the Vercel env.",
      );
    }
    return createHash("sha256").update("forleads-dev-insecure-session-secret-change-me").digest();
  }
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

export function sealValue(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, data]).toString("base64url");
}

export function unsealValue<T>(token: string): T | null {
  try {
    const raw = Buffer.from(token, "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = createDecipheriv(ALG, key(), iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(out.toString("utf8")) as T;
  } catch {
    return null; // tampered or wrong key → treat as logged out
  }
}

export function seal(session: Session): string {
  return sealValue(session);
}

export function unseal(token: string): Session | null {
  return unsealValue<Session>(token);
}

// ---- Next.js cookie helpers (server components / route handlers) ------------

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
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
