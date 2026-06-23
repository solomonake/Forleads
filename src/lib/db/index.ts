// ============================================================================
// Repository singleton. Survives Next.js HMR via globalThis so in-memory data
// persists across hot reloads in dev. Seeds once on first access.
// FORLEADS_PERSIST=supabase would return the Postgres-backed repo here instead.
// ============================================================================

import { config } from "@/lib/core/config";
import { emptyStore, InMemoryRepository, type Repository } from "./repository";
import { seed } from "./seed";

interface RepoGlobal {
  __forleadsRepo?: Repository;
  __forleadsSeeded?: Promise<void>;
}

const g = globalThis as unknown as RepoGlobal;

function buildRepo(): Repository {
  if (config.persist === "supabase") {
    // Supabase-backed repo would be constructed here using the service key and
    // RLS-scoped queries (see supabase/migrations). Falls back to memory so the
    // app never hard-fails if creds are partial.
    if (config.supabase.url && config.supabase.serviceKey) {
      // Intentional: a full Supabase repo is a drop-in implementing Repository.
      // Until wired, use memory to keep the loop runnable.
    }
  }
  return new InMemoryRepository(emptyStore());
}

export async function getRepo(): Promise<Repository> {
  if (!g.__forleadsRepo) {
    g.__forleadsRepo = buildRepo();
  }
  if (!g.__forleadsSeeded) {
    g.__forleadsSeeded = seed(g.__forleadsRepo);
  }
  await g.__forleadsSeeded;
  return g.__forleadsRepo;
}

export type { Repository } from "./repository";
