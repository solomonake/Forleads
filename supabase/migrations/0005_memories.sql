-- ============================================================================
-- 0005_memories.sql — lead-scoped memory recall.
--
-- The dispatcher consults `memory` BEFORE spending scout budget on a lead it
-- has researched before. Each row is a small, embedded surface form — a prior
-- evidence card, a free-text note, or a domain event — pinned to one lead.
-- Cross-lead recall is intentionally forbidden by the RLS policy below: an
-- agent can only recall rows scoped to leads they own (already enforced for
-- lead_surface) and the table is keyed on lead_surface_id.
--
-- pgvector was enabled in 0001_init.sql; cosine distance (vector_cosine_ops)
-- matches the cosine similarity we compute in the in-memory repo so recall
-- semantics are identical across backends.
-- ============================================================================

create table if not exists memory (
  id              uuid primary key default uuid_generate_v4(),
  agent_id        uuid not null references agent(id) on delete cascade,
  lead_surface_id uuid not null references lead_surface(id) on delete cascade,
  kind            text not null check (kind in ('evidence','note','event')),
  text            text not null,
  ref             text,
  confidence      text check (confidence in ('A','B','C','D')),
  embedding       vector(1024) not null,
  created_at      timestamptz not null default now()
);

create index if not exists memory_lead_ix on memory (lead_surface_id);
create index if not exists memory_agent_ix on memory (agent_id);

-- IVFFlat index for cosine — adequate at the small-to-medium scale we expect
-- per agent. Lists=100 is a sensible starting bucket count; tune later under load.
create index if not exists memory_embedding_ix
  on memory using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table memory enable row level security;

-- Same model as lead_surface: an agent can only see memories whose lead they own.
do $$ begin
  create policy memory_select_own on memory
    for select using (
      exists (
        select 1 from lead_surface ls
        where ls.id = memory.lead_surface_id
          and ls.agent_id in (
            select id from agent where auth_uid = auth.uid()
          )
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy memory_insert_own on memory
    for insert with check (
      exists (
        select 1 from lead_surface ls
        where ls.id = memory.lead_surface_id
          and ls.agent_id in (
            select id from agent where auth_uid = auth.uid()
          )
      )
    );
exception when duplicate_object then null; end $$;

-- RPC: top-K cosine recall scoped to a single lead. The dispatcher calls this
-- before fanning out scouts. Returns rows + similarity (1 - cosine distance).
create or replace function fl_recall_memories(
  p_lead_id uuid,
  p_query   vector(1024),
  p_k       int default 8
)
returns table (
  id              uuid,
  agent_id        uuid,
  lead_surface_id uuid,
  kind            text,
  text            text,
  ref             text,
  confidence      text,
  embedding       vector(1024),
  created_at      timestamptz,
  similarity      double precision
)
language sql
stable
as $$
  select
    m.id,
    m.agent_id,
    m.lead_surface_id,
    m.kind,
    m.text,
    m.ref,
    m.confidence,
    m.embedding,
    m.created_at,
    1 - (m.embedding <=> p_query) as similarity
  from memory m
  where m.lead_surface_id = p_lead_id
  order by m.embedding <=> p_query
  limit greatest(p_k, 1);
$$;
