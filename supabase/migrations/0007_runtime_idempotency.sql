alter table domain_event
  add column if not exists idempotency_key text;

create unique index if not exists domain_event_agent_idempotency_ix
  on domain_event (agent_id, idempotency_key)
  where idempotency_key is not null;

alter table connector_write
  add column if not exists result_json jsonb not null default '{}';
