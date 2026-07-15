-- Approval reserves the exact reviewed revision before external I/O. The
-- transient state prevents a concurrent edit from being marked as sent after
-- an older revision reaches a provider.
alter table artifact drop constraint if exists artifact_status_check;

alter table artifact
  add constraint artifact_status_check
  check (status in ('drafted','approving','blocked','approved','sent','cancelled','snoozed'));
