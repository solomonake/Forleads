-- Freeze the human-reviewed CRM destination on the artifact. Approval still
-- revalidates the current tenant-owned binding before any connector write.
alter table artifact
  add column if not exists connector_binding jsonb;
