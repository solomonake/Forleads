-- A tenant/provider may have only one active credential generation. Clean up
-- any historical overlap before enforcing the invariant at the database
-- boundary; the newest row remains live and older rows are revoked.
with ranked as (
  select
    id,
    row_number() over (
      partition by agent_id, provider
      order by updated_at desc, created_at desc, id desc
    ) as rank
  from connector_credential
  where revoked_at is null
)
update connector_credential
set revoked_at = now(), updated_at = now()
where id in (select id from ranked where rank > 1);

create unique index if not exists connector_credential_one_live_ix
  on connector_credential (agent_id, provider)
  where revoked_at is null;
