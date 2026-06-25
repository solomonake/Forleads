alter table artifact
  add column if not exists revision integer not null default 1
    check (revision >= 1),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists approved_revision integer;

create index if not exists artifact_agent_revision_ix
  on artifact (agent_id, id, revision);

alter table artifact
  drop constraint if exists artifact_approved_revision_matches;

alter table artifact
  add constraint artifact_approved_revision_matches check (
    status not in ('approved', 'sent')
    or approved_revision = revision
  );
