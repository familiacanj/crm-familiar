-- One personal entry can allocate a purchase between the user's own budget
-- and the family budget. The family half is a linked direct expense, never
-- a cash contribution and never an automatic reimbursement request.

create table if not exists public.personal_expense_transactions (
  transaction_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  owner_user_id text not null,
  scope text not null check (scope in ('personal', 'family', 'mixed')),
  description text not null check (char_length(btrim(description)) between 1 and 240),
  occurred_on date not null,
  total_amount numeric(14,2) not null check (total_amount > 0),
  personal_amount numeric(14,2) not null check (personal_amount >= 0),
  family_amount numeric(14,2) not null check (family_amount >= 0),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 160),
  created_at timestamptz not null default now(),
  constraint personal_expense_transactions_amounts_match
    check (total_amount = personal_amount + family_amount),
  constraint personal_expense_transactions_scope_amounts
    check (
      (scope = 'personal' and personal_amount = total_amount and family_amount = 0)
      or (scope = 'family' and family_amount = total_amount and personal_amount = 0)
      or (scope = 'mixed' and personal_amount > 0 and family_amount > 0)
    ),
  constraint personal_expense_transactions_owner_key_unique
    unique (family_id, owner_user_id, idempotency_key),
  foreign key (family_id, owner_user_id)
    references public.family_memberships(family_id, user_id) on delete cascade
);

create index if not exists personal_expense_transactions_owner_period_idx
  on public.personal_expense_transactions(owner_user_id, family_id, occurred_on);

create index if not exists personal_expense_transactions_family_period_idx
  on public.personal_expense_transactions(family_id, occurred_on);

alter table public.personal_expense_transactions enable row level security;
revoke all on public.personal_expense_transactions from anon;
revoke insert, update, delete on public.personal_expense_transactions from authenticated;
grant select on public.personal_expense_transactions to authenticated;
grant all on public.personal_expense_transactions to service_role;

drop policy if exists personal_expense_transactions_owner_only
  on public.personal_expense_transactions;
create policy personal_expense_transactions_owner_only
  on public.personal_expense_transactions for select to authenticated
  using (owner_user_id = (select auth.uid())::text);

alter table public.family_financial_movements
  add column if not exists source_personal_expense_id text
  references public.personal_expense_transactions(transaction_id) on delete set null;

create unique index if not exists family_financial_movements_personal_expense_unique
  on public.family_financial_movements(source_personal_expense_id)
  where source_personal_expense_id is not null;

-- Shared family activity is visible to active family members. Private purchase
-- splits remain in the owner-only table above; the shared row contains only
-- the family amount and its description.
drop policy if exists family_financial_movements_owner_read
  on public.family_financial_movements;
drop policy if exists family_financial_movements_member_read
  on public.family_financial_movements;
create policy family_financial_movements_member_read
  on public.family_financial_movements for select to authenticated
  using (
    exists (
      select 1 from public.family_memberships fm
      where fm.family_id = family_financial_movements.family_id
        and fm.user_id = (select auth.uid())::text
    )
  );

create or replace function public.record_personal_expense_transaction(
  p_family_id text,
  p_owner_user_id text,
  p_scope text,
  p_description text,
  p_occurred_on date,
  p_total_amount numeric,
  p_personal_amount numeric,
  p_family_amount numeric,
  p_idempotency_key text
)
returns table (
  transaction_id text,
  family_id text,
  owner_user_id text,
  scope text,
  description text,
  occurred_on date,
  total_amount numeric,
  personal_amount numeric,
  family_amount numeric,
  family_movement_id text,
  idempotent boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction public.personal_expense_transactions%rowtype;
  v_movement public.family_financial_movements%rowtype;
  v_scope text := btrim(p_scope);
  v_description text := btrim(p_description);
  v_key text := btrim(p_idempotency_key);
  v_transaction_id text;
  v_movement_key text;
begin
  if v_scope not in ('personal', 'family', 'mixed') then
    raise exception 'expense_scope_invalid';
  end if;
  if v_description = '' or v_key = '' then
    raise exception 'expense_description_or_key_required';
  end if;
  if char_length(v_description) > 240 or char_length(v_key) > 160 then
    raise exception 'expense_text_too_long';
  end if;
  if p_total_amount is null or p_total_amount <= 0
     or p_personal_amount is null or p_personal_amount < 0
     or p_family_amount is null or p_family_amount < 0
     or round(p_total_amount, 2) <> round(p_personal_amount + p_family_amount, 2) then
    raise exception 'expense_amounts_invalid';
  end if;
  if (v_scope = 'personal' and (p_personal_amount <> p_total_amount or p_family_amount <> 0))
     or (v_scope = 'family' and (p_family_amount <> p_total_amount or p_personal_amount <> 0))
     or (v_scope = 'mixed' and (p_personal_amount <= 0 or p_family_amount <= 0)) then
    raise exception 'expense_scope_amounts_invalid';
  end if;
  if not exists (
    select 1 from public.family_memberships fm
    where fm.family_id = p_family_id and fm.user_id = p_owner_user_id
  ) then
    raise exception 'expense_owner_not_family_member';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_family_id || ':' || p_owner_user_id || ':' || v_key, 0
  ));

  select * into v_transaction
  from public.personal_expense_transactions t
  where t.family_id = p_family_id
    and t.owner_user_id = p_owner_user_id
    and t.idempotency_key = v_key;

  if v_transaction.transaction_id is not null then
    if v_transaction.scope <> v_scope
       or v_transaction.description <> v_description
       or v_transaction.occurred_on <> p_occurred_on
       or v_transaction.total_amount <> round(p_total_amount, 2)
       or v_transaction.personal_amount <> round(p_personal_amount, 2)
       or v_transaction.family_amount <> round(p_family_amount, 2) then
      raise exception 'expense_idempotency_key_reused';
    end if;
    select * into v_movement from public.family_financial_movements m
    where m.source_personal_expense_id = v_transaction.transaction_id;
    return query select v_transaction.transaction_id, v_transaction.family_id,
      v_transaction.owner_user_id, v_transaction.scope, v_transaction.description,
      v_transaction.occurred_on, v_transaction.total_amount, v_transaction.personal_amount,
      v_transaction.family_amount, v_movement.movement_id, true;
    return;
  end if;

  v_transaction_id := 'pexp_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.personal_expense_transactions (
    transaction_id, family_id, owner_user_id, scope, description, occurred_on,
    total_amount, personal_amount, family_amount, idempotency_key
  ) values (
    v_transaction_id, p_family_id, p_owner_user_id, v_scope, v_description,
    p_occurred_on, round(p_total_amount, 2), round(p_personal_amount, 2),
    round(p_family_amount, 2), v_key
  ) returning * into v_transaction;

  if v_transaction.family_amount > 0 then
    v_movement_key := 'personal-expense:' || md5(
      p_family_id || ':' || p_owner_user_id || ':' || v_key
    );
    insert into public.family_financial_movements (
      movement_id, family_id, created_by_user_id, kind, amount, occurred_on,
      description, idempotency_key, source_personal_expense_id
    ) values (
      'fmove_' || replace(gen_random_uuid()::text, '-', ''), p_family_id,
      p_owner_user_id, 'direct_family_expense', round(p_family_amount, 2),
      p_occurred_on, v_description, v_movement_key, v_transaction.transaction_id
    ) returning * into v_movement;
  end if;

  return query select v_transaction.transaction_id, v_transaction.family_id,
    v_transaction.owner_user_id, v_transaction.scope, v_transaction.description,
    v_transaction.occurred_on, v_transaction.total_amount, v_transaction.personal_amount,
    v_transaction.family_amount, v_movement.movement_id, false;
end;
$$;

revoke execute on function public.record_personal_expense_transaction(
  text, text, text, text, date, numeric, numeric, numeric, text
) from public, anon, authenticated;
grant execute on function public.record_personal_expense_transaction(
  text, text, text, text, date, numeric, numeric, numeric, text
) to service_role;

-- Record a reimbursement only when the family manager has actually returned
-- money. No request is generated when a family expense is first recorded.
create or replace function public.record_family_reimbursement_paid(
  p_family_id text,
  p_paid_by_user_id text,
  p_expense_movement_id text,
  p_idempotency_key text
)
returns table (
  reimbursement_id text,
  payment_id text,
  expense_movement_id text,
  requested_by_user_id text,
  amount numeric,
  idempotent boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_movement public.family_financial_movements%rowtype;
  v_reimbursement public.family_reimbursements%rowtype;
  v_payment public.family_reimbursement_payments%rowtype;
  v_key text := btrim(p_idempotency_key);
begin
  if v_key = '' or char_length(v_key) > 160 then
    raise exception 'reimbursement_idempotency_key_invalid';
  end if;
  if not exists (
    select 1 from public.family_memberships fm
    where fm.family_id = p_family_id and fm.user_id = p_paid_by_user_id
      and fm.role in ('owner', 'admin')
  ) then
    raise exception 'reimbursement_manager_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_family_id || ':reimbursement:' || v_key, 0));
  select * into v_movement from public.family_financial_movements m
  where m.family_id = p_family_id and m.movement_id = p_expense_movement_id
    and m.kind = 'direct_family_expense';
  if v_movement.movement_id is null then
    raise exception 'reimbursement_family_expense_not_found';
  end if;

  select * into v_payment from public.family_reimbursement_payments p
  where p.family_id = p_family_id and p.idempotency_key = v_key;
  if v_payment.payment_id is not null then
    select * into v_reimbursement from public.family_reimbursements r
    where r.reimbursement_id = v_payment.reimbursement_id;
    if v_reimbursement.expense_movement_id <> p_expense_movement_id then
      raise exception 'reimbursement_idempotency_key_reused';
    end if;
    return query select v_payment.reimbursement_id, v_payment.payment_id,
      v_reimbursement.expense_movement_id, v_reimbursement.requested_by_user_id,
      v_payment.amount, true;
    return;
  end if;

  select * into v_reimbursement from public.family_reimbursements r
  where r.expense_movement_id = p_expense_movement_id;
  if v_reimbursement.reimbursement_id is not null then
    if v_reimbursement.status = 'paid' then
      raise exception 'reimbursement_already_paid';
    end if;
    if v_reimbursement.status = 'cancelled' then
      raise exception 'reimbursement_cancelled';
    end if;
    update public.family_reimbursements r
      set status = 'paid', settled_at = now()
      where r.reimbursement_id = v_reimbursement.reimbursement_id
      returning * into v_reimbursement;
  else
    insert into public.family_reimbursements (
      reimbursement_id, family_id, expense_movement_id, requested_by_user_id,
      amount, description, status, settled_at
    ) values (
      'freimb_' || replace(gen_random_uuid()::text, '-', ''), p_family_id,
      p_expense_movement_id, v_movement.created_by_user_id,
      v_movement.amount, v_movement.description, 'paid', now()
    ) returning * into v_reimbursement;
  end if;

  insert into public.family_reimbursement_payments (
    payment_id, family_id, reimbursement_id, paid_by_user_id, amount, idempotency_key
  ) values (
    'freimbpay_' || replace(gen_random_uuid()::text, '-', ''), p_family_id,
    v_reimbursement.reimbursement_id, p_paid_by_user_id, v_reimbursement.amount, v_key
  ) returning * into v_payment;

  return query select v_reimbursement.reimbursement_id, v_payment.payment_id,
    v_reimbursement.expense_movement_id, v_reimbursement.requested_by_user_id,
    v_payment.amount, false;
end;
$$;

revoke execute on function public.record_family_reimbursement_paid(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_family_reimbursement_paid(text, text, text, text)
  to service_role;

comment on table public.personal_expense_transactions is
  'Owner-private single expense with personal and family allocations; family share links to one shared direct expense.';
comment on column public.family_financial_movements.source_personal_expense_id is
  'Private personal expense parent id; the shared row exposes only the allocated family expense.';
