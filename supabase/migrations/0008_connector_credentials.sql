create table if not exists connector_credential (
  id                uuid primary key default uuid_generate_v4(),
  agent_id          uuid not null references agent(id) on delete cascade,
  provider          text not null
                      check (provider in ('google','microsoft','followupboss','gohighlevel','twilio','zapier')),
  encrypted_payload text not null,
  version           integer not null default 1 check (version >= 1),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  revoked_at        timestamptz
);

create index if not exists connector_credential_agent_provider_ix
  on connector_credential (agent_id, provider)
  where revoked_at is null;

alter table connector_credential enable row level security;

create policy connector_credential_own on connector_credential
  for all
  using (agent_id in (select current_agent_ids()))
  with check (agent_id in (select current_agent_ids()));
