-- Production already has the explicit constraint name from the table DDL.
-- Older staging histories may instead contain PostgreSQL's truncated generated
-- name. Reconcile either state without changing transfer rows or indexes.
do $$
begin
  if to_regclass('public.personal_family_transfers') is null then
    return;
  end if;

  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'personal_family_transfers'
      and c.conname = 'personal_family_transfers_idempotency_key_unique'
  ) then
    return;
  end if;

  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'personal_family_transfers'
      and c.conname = 'personal_family_transfers_family_id_owner_user_id_idempoten_key'
  ) then
    alter table public.personal_family_transfers
      rename constraint personal_family_transfers_family_id_owner_user_id_idempoten_key
      to personal_family_transfers_idempotency_key_unique;
    return;
  end if;

  raise exception 'Restrição de idempotência de transferência não encontrada';
end;
$$;
