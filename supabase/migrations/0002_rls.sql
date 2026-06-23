-- ============================================================================
-- Row-Level Security — every table is agent-scoped so an agent only ever sees
-- their own rows (docs/Forleads_Architecture_v1.md §9). Policies key off the
-- agent row whose auth_uid matches the authenticated user.
-- ============================================================================

-- Helper: the agent id(s) owned by the current authenticated user.
-- search_path pinned (Supabase linter: mutable search_path).
create or replace function current_agent_ids()
returns setof uuid
language sql stable
security definer
set search_path = public, pg_temp
as $$
  select id from agent where auth_uid = auth.uid();
$$;

-- Enable RLS everywhere.
alter table agent              enable row level security;
alter table connector_account  enable row level security;
alter table lead_surface       enable row level security;
alter table evidence_card      enable row level security;
alter table note               enable row level security;
alter table loop_definition    enable row level security;
alter table loop_run           enable row level security;
alter table artifact           enable row level security;
alter table connector_write    enable row level security;
alter table domain_event       enable row level security;
alter table agent_trace        enable row level security;
alter table watcher            enable row level security;
alter table memory_chunk       enable row level security;
alter table report             enable row level security;

-- agent: a user sees/edits only their own agent row(s).
create policy agent_self on agent
  using (auth_uid = auth.uid()) with check (auth_uid = auth.uid());

-- Generic agent-scoped policy applied to each child table.
create policy ca_select on connector_account for select using (agent_id in (select current_agent_ids()));
create policy ca_write  on connector_account for all    using (agent_id in (select current_agent_ids())) with check (agent_id in (select current_agent_ids()));

create policy ls_all on lead_surface for all using (agent_id in (select current_agent_ids())) with check (agent_id in (select current_agent_ids()));

-- evidence_card is scoped through its lead_surface.
create policy ec_all on evidence_card for all
  using (lead_surface_id in (select id from lead_surface where agent_id in (select current_agent_ids())))
  with check (lead_surface_id in (select id from lead_surface where agent_id in (select current_agent_ids())));

create policy note_all   on note            for all using (agent_id in (select current_agent_ids())) with check (agent_id in (select current_agent_ids()));
create policy ld_all     on loop_definition for all using (agent_id in (select current_agent_ids())) with check (agent_id in (select current_agent_ids()));
create policy lr_all     on loop_run        for all using (agent_id in (select current_agent_ids())) with check (agent_id in (select current_agent_ids()));
create policy art_all    on artifact        for all using (agent_id in (select current_agent_ids())) with check (agent_id in (select current_agent_ids()));
create policy cw_all     on connector_write for all using (agent_id in (select current_agent_ids())) with check (agent_id in (select current_agent_ids()));
create policy de_all     on domain_event    for all using (agent_id in (select current_agent_ids())) with check (agent_id in (select current_agent_ids()));
create policy at_all     on agent_trace     for all using (agent_id in (select current_agent_ids())) with check (agent_id in (select current_agent_ids()));
create policy w_all      on watcher         for all using (agent_id in (select current_agent_ids())) with check (agent_id in (select current_agent_ids()));
create policy mc_all     on memory_chunk    for all using (agent_id in (select current_agent_ids())) with check (agent_id in (select current_agent_ids()));
create policy rep_all    on report          for all using (agent_id in (select current_agent_ids())) with check (agent_id in (select current_agent_ids()));
