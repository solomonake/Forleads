-- Durable, agent-scoped area priors. Only grounded market facts are written by
-- the application; parcel, imagery, people, synthetic risk, and grade-D gaps
-- remain lead-scoped.
alter table memory
  add column if not exists h3_index text;

alter table memory
  drop constraint if exists memory_kind_check;

alter table memory
  add constraint memory_kind_check
  check (kind in ('evidence', 'note', 'event', 'outcome', 'neighborhood'));

create index if not exists memory_neighborhood_ix
  on memory (agent_id, h3_index, created_at desc)
  where kind = 'neighborhood';
