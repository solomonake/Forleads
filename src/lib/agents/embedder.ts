// ============================================================================
// Embedder — turns a text snippet into a 1024-dim vector for lead-scoped recall.
//
// Mock-first: when OLLAMA_URL is unset, unreachable, or the call fails, fall
// back to a deterministic hash embedder so the full loop still runs locally
// with zero credentials (CLAUDE.md provider posture). Real adapter activates
// when OLLAMA_URL is reachable and EMBEDDING_MODEL is loaded.
// ============================================================================

const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM ?? "1024");
const OLLAMA_URL = process.env.OLLAMA_URL?.trim();
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL?.trim() ?? "Qwen/Qwen3-Embedding-0.6B";

const REQUEST_TIMEOUT_MS = 1500;

/** Deterministic FNV-1a 32-bit hash — same input always yields same vector. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic mock embedder. Hash-buckets the words of the input into a
 * fixed-dim vector and L2-normalizes it. Identical text → identical vector
 * → cosine similarity 1.0, so recall stays meaningful even without Ollama.
 */
function mockEmbed(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const tok of tokens) {
    const idx = fnv1a(tok) % EMBEDDING_DIM;
    const sign = (fnv1a("s:" + tok) & 1) === 0 ? 1 : -1;
    v[idx] = (v[idx] ?? 0) + sign;
  }
  // L2-normalize so cosine === dot product (matches pgvector cosine semantics).
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / norm;
  return v;
}

async function ollamaEmbed(text: string): Promise<number[] | null> {
  if (!OLLAMA_URL) return null;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const r = await fetch(`${OLLAMA_URL.replace(/\/+$/, "")}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
      signal: ac.signal,
    });
    if (!r.ok) return null;
    const json = (await r.json()) as { embedding?: number[] };
    const e = json.embedding;
    if (!Array.isArray(e) || e.length !== EMBEDDING_DIM) return null;
    return e;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export interface Embedder {
  embed(text: string): Promise<number[]>;
  /** "ollama" once a live call has succeeded; "mock" until then. */
  mode: "mock" | "ollama";
}

let liveSeen = false;

export function getEmbedder(): Embedder {
  return {
    get mode() {
      return liveSeen ? "ollama" : "mock";
    },
    async embed(text: string) {
      const live = await ollamaEmbed(text);
      if (live) {
        liveSeen = true;
        return live;
      }
      return mockEmbed(text);
    },
  };
}

/** Cosine similarity for two equal-length, L2-normalized OR raw vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

export { EMBEDDING_DIM };
