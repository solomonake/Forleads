import { createClient } from "@supabase/supabase-js";
import { config } from "@/lib/core/config";

const REQUIRED_SCHEMA = [
  {
    label: "artifact revisions",
    table: "artifact",
    columns: "revision,updated_at,approved_revision",
  },
  {
    label: "event idempotency",
    table: "domain_event",
    columns: "idempotency_key",
  },
  {
    label: "connector write results",
    table: "connector_write",
    columns: "result_json",
  },
  {
    label: "encrypted connector credentials",
    table: "connector_credential",
    columns: "id",
  },
  {
    label: "neighborhood memory",
    table: "memory",
    columns: "h3_index",
  },
] as const;

export async function assertSupabaseSchema(): Promise<void> {
  if (config.persist !== "supabase") return;
  if (!config.supabase.url || !config.supabase.serviceKey) {
    throw new Error("Supabase persistence selected without server credentials.");
  }

  const client = createClient(config.supabase.url, config.supabase.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const failures: string[] = [];
  await Promise.all(
    REQUIRED_SCHEMA.map(async ({ label, table, columns }) => {
      const { error } = await client.from(table).select(columns).limit(1);
      if (error) failures.push(`${label}: ${error.message}`);
    }),
  );
  if (failures.length > 0) {
    throw new Error(`Required database schema is unavailable: ${failures.join("; ")}`);
  }
}
