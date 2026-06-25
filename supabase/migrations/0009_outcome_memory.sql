-- Allow human-gate outcomes to be stored by the durable memory repository.
alter table memory
  drop constraint if exists memory_kind_check;

alter table memory
  add constraint memory_kind_check
  check (kind in ('evidence', 'note', 'event', 'outcome'));
