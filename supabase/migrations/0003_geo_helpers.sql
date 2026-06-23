-- ============================================================================
-- Geo + repo helpers for the durable SupabaseRepository.
--  - Generated lng/lat columns let us READ coordinates without PostGIS calls
--    over PostgREST.
--  - fl_upsert_lead_surface builds the geography(Point) from lng/lat on WRITE
--    (PostgREST can't construct geography inline).
--  - artifact.edit_history backs the domain ArtifactEdit[] field.
-- All functions pin search_path (Supabase linter: mutable search_path).
-- ============================================================================

alter table lead_surface
  add column if not exists lng double precision
    generated always as (st_x(geom::geometry)) stored,
  add column if not exists lat double precision
    generated always as (st_y(geom::geometry)) stored;

alter table artifact
  add column if not exists edit_history jsonb not null default '[]';

create or replace function fl_upsert_lead_surface(
  p_id uuid,
  p_agent_id uuid,
  p_lng double precision,
  p_lat double precision,
  p_address text,
  p_locality text,
  p_h3 text,
  p_status text,
  p_label text,
  p_contact jsonb,
  p_first_seen timestamptz,
  p_last_worked timestamptz
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into lead_surface (
    id, agent_id, geom, address, locality, h3_index, status, label,
    contact_json, first_seen_at, last_worked_at
  )
  values (
    p_id, p_agent_id,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    p_address, p_locality, p_h3, p_status, p_label, p_contact,
    coalesce(p_first_seen, now()), coalesce(p_last_worked, now())
  )
  on conflict (id) do update set
    agent_id       = excluded.agent_id,
    geom           = excluded.geom,
    address        = excluded.address,
    locality       = excluded.locality,
    h3_index       = excluded.h3_index,
    status         = excluded.status,
    label          = excluded.label,
    contact_json   = excluded.contact_json,
    last_worked_at = excluded.last_worked_at;
$$;
