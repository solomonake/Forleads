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
    // supabase/migrations). Never fall back to memory after durable
    // persistence was selected: that would accept writes the user believes
    // are durable and misreport the runtime mode.
    if (config.supabase.url && config.supabase.serviceKey) {
      return new SupabaseRepository(config.supabase.url, config.supabase.serviceKey);
    }
    throw new Error(
      "FORLEADS_PERSIST=supabase requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
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
