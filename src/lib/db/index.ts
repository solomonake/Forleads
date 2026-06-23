// ============================================================================
// Repository singleton. Survives Next.js HMR via globalThis so in-memory data
// persists across hot reloads in dev. Seeds once on first access.
// FORLEADS_PERSIST=supabase would return the Postgres-backed repo here instead.
// ============================================================================

import { config } from "@/lib/core/config";
import { emptyStore, InMemoryRepository, type Repository } from "./repository";
import { SupabaseRepository } from "./supabase-repo";
import { seed } from "./seed";

interface RepoGlobal {
  __forleadsRepo?: Repository;
  __forleadsSeeded?: Promise<void>;
}

const g = globalThis as unknown as RepoGlobal;

function buildRepo(): Repository {
  if (config.persist === "supabase") {
    // Durable Postgres-backed repo (service-role key, bypasses RLS; see
    // supabase/migrations). Falls back to memory if creds are partial so the
    // app never hard-fails — but log loudly so the mode mismatch is visible.
    if (config.supabase.url && config.supabase.serviceKey) {
      return new SupabaseRepository(config.supabase.url, config.supabase.serviceKey);
    }
    console.warn(
      "[forleads] FORLEADS_PERSIST=supabase but NEXT_PUBLIC_SUPABASE_URL / " +
        "SUPABASE_SERVICE_ROLE_KEY are missing — falling back to in-memory store.",
    );
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
