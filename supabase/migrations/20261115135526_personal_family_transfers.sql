-- Generic personal/family transfers. The private side is owner-only; the
-- family side is an aggregate movement linked by a stable transfer record.

alter table public.family_financial_movements
  drop constraint if exists family_financial_movements_kind_check;

alter table public.family_financial_movements
  add constraint family_financial_movements_kind_check
  check (kind in (
    'cash_contribution',
    'direct_family_expense',
    'personal_to_family_transfer',
    'family_to_personal_transfer'
  ));

create table if not exists public.personal_family_transfers (
  transfer_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  owner_user_id text not null,
  direction text not null check (direction in ('personal_to_family', 'family_to_personal')),
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null,
  description text not null check (char_length(btrim(description)) between 1 and 240),
  family_movement_id text not null unique references public.family_financial_movements(movement_id) on delete cascade,
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 160),
  created_at timestamptz not null default now(),
  constraint personal_family_transfers_idempotency_key_unique unique (family_id, owner_user_id, idempotency_key),
  foreign key (family_id, owner_user_id)
    references public.family_memberships(family_id, user_id) on delete cascade
);

create index if not exists personal_family_transfers_owner_period_idx
  on public.personal_family_transfers(owner_user_id, family_id, occurred_on);

alter table public.personal_family_transfers enable row level security;

revoke all on public.personal_family_transfers from anon;
revoke insert, update, delete on public.personal_family_transfers from authenticated;
grant select on public.personal_family_transfers to authenticated;
grant all on public.personal_family_transfers to service_role;

drop policy if exists personal_family_transfers_owner_only on public.personal_family_transfers;
create policy personal_family_transfers_owner_only on public.personal_family_transfers
  for select to authenticated
  using (owner_user_id = (select auth.uid())::text);

-- This RPC is the transaction boundary for both sides of a transfer.
-- The family movement contains only an aggregate-compatible kind and the
-- private transfer row remains readable only by its owner.
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
