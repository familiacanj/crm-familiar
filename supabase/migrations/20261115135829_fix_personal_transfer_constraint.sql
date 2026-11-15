-- PostgreSQL truncates long generated constraint names. Rename the staging
-- constraint to the explicit stable name used by the RPC and future diffs.
alter table public.personal_family_transfers
  rename constraint personal_family_transfers_family_id_owner_user_id_idempoten_key
  to personal_family_transfers_idempotency_key_unique;

create or replace function public.record_personal_family_transfer(
  p_family_id text,
  p_owner_user_id text,
  p_direction text,
  p_amount numeric,
  p_occurred_on date,
  p_description text,
  p_idempotency_key text
)
returns table (
  transfer_id text,
  family_id text,
  owner_user_id text,
  direction text,
  amount numeric,
  occurred_on date,
  description text,
  family_movement_id text,
  idempotent boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transfer public.personal_family_transfers%rowtype;
  v_movement public.family_financial_movements%rowtype;
  v_direction text := btrim(p_direction);
  v_description text := btrim(p_description);
  v_idempotency_key text := btrim(p_idempotency_key);
  v_movement_key text;
  v_kind text;
begin
  if v_direction not in ('personal_to_family', 'family_to_personal') then
    raise exception 'Direção de transferência inválida';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor deve ser maior que zero';
  end if;
  if v_description = '' or v_idempotency_key = '' then
    raise exception 'Descrição e chave da operação são obrigatórias';
  end if;
  if not exists (
    select 1 from public.family_memberships fm
    where fm.family_id = p_family_id and fm.user_id = p_owner_user_id
  ) then
    raise exception 'Usuário não pertence à família';
  end if;

  select * into v_transfer
  from public.personal_family_transfers t
  where t.family_id = p_family_id
    and t.owner_user_id = p_owner_user_id
    and t.idempotency_key = v_idempotency_key;
  if v_transfer.transfer_id is not null then
    return query select v_transfer.transfer_id, v_transfer.family_id,
      v_transfer.owner_user_id, v_transfer.direction, v_transfer.amount,
      v_transfer.occurred_on, v_transfer.description,
      v_transfer.family_movement_id, true;
    return;
  end if;

  v_kind := case when v_direction = 'personal_to_family'
    then 'personal_to_family_transfer'
    else 'family_to_personal_transfer' end;
  v_movement_key := 'transfer:' || md5(
    p_family_id || ':' || p_owner_user_id || ':' || v_idempotency_key
  );

  insert into public.family_financial_movements (
    movement_id, family_id, created_by_user_id, kind, amount, occurred_on,
    description, idempotency_key
  ) values (
    'fmove_' || replace(gen_random_uuid()::text, '-', ''), p_family_id,
    p_owner_user_id, v_kind, round(p_amount, 2), p_occurred_on,
    v_description, v_movement_key
  )
  on conflict on constraint family_financial_movements_family_id_idempotency_key_key do nothing
  returning * into v_movement;

  if v_movement.movement_id is null then
    select * into v_movement
    from public.family_financial_movements m
    where m.family_id = p_family_id and m.idempotency_key = v_movement_key;
  end if;

  insert into public.personal_family_transfers (
    transfer_id, family_id, owner_user_id, direction, amount, occurred_on,
    description, family_movement_id, idempotency_key
  ) values (
    'xfer_' || replace(gen_random_uuid()::text, '-', ''), p_family_id,
    p_owner_user_id, v_direction, round(p_amount, 2), p_occurred_on,
    v_description, v_movement.movement_id, v_idempotency_key
  )
  on conflict on constraint personal_family_transfers_idempotency_key_unique do nothing
  returning * into v_transfer;

  if v_transfer.transfer_id is null then
    select * into v_transfer
    from public.personal_family_transfers t
    where t.family_id = p_family_id
      and t.owner_user_id = p_owner_user_id
      and t.idempotency_key = v_idempotency_key;
  end if;

  return query select v_transfer.transfer_id, v_transfer.family_id,
    v_transfer.owner_user_id, v_transfer.direction, v_transfer.amount,
    v_transfer.occurred_on, v_transfer.description,
    v_transfer.family_movement_id, false;
end;
$$;

revoke execute on function public.record_personal_family_transfer(text, text, text, numeric, date, text, text)
  from public, anon, authenticated;
grant execute on function public.record_personal_family_transfer(text, text, text, numeric, date, text, text)
  to service_role;
