-- Private recurring monthly budgets. Existing family records remain untouched
-- and continue to be shared. Ownership is tied to the authenticated profile.
create table if not exists public.personal_financial_items (
  item_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  owner_user_id text not null references public.profiles(user_id) on delete cascade,
  kind text not null check (kind in ('income', 'fixed', 'variable')),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  icon text not null default 'tag',
  default_value numeric(14,2) not null default 0 check (default_value >= 0),
  created_at timestamptz not null default now(),
  unique (item_id, family_id, owner_user_id)
);

create index if not exists personal_financial_items_owner_kind_idx
  on public.personal_financial_items(owner_user_id, family_id, kind);

create table if not exists public.personal_financial_entries (
  item_id text not null,
  family_id text not null,
  owner_user_id text not null,
  year integer not null check (year between 2000 and 2200),
  month integer not null check (month between 1 and 12),
  value numeric(14,2) not null check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (item_id, year, month),
  foreign key (item_id, family_id, owner_user_id)
    references public.personal_financial_items(item_id, family_id, owner_user_id) on delete cascade
);

create index if not exists personal_financial_entries_owner_period_idx
  on public.personal_financial_entries(owner_user_id, family_id, year, month);

alter table public.personal_financial_items enable row level security;
alter table public.personal_financial_entries enable row level security;

revoke all on public.personal_financial_items, public.personal_financial_entries from anon;
grant select, insert, update, delete on public.personal_financial_items, public.personal_financial_entries to authenticated;
grant all on public.personal_financial_items, public.personal_financial_entries to service_role;

drop policy if exists personal_financial_items_owner_only on public.personal_financial_items;
create policy personal_financial_items_owner_only on public.personal_financial_items
  for all to authenticated
  using (owner_user_id = auth.uid()::text)
  with check (owner_user_id = auth.uid()::text);

drop policy if exists personal_financial_entries_owner_only on public.personal_financial_entries;
create policy personal_financial_entries_owner_only on public.personal_financial_entries
  for all to authenticated
  using (owner_user_id = auth.uid()::text)
  with check (owner_user_id = auth.uid()::text);

comment on table public.personal_financial_items is
  'Recurring items in one authenticated user personal budget; never included in family totals.';
comment on table public.personal_financial_entries is
  'Monthly private value overrides for a single owner; existing public.entries are not migrated.';

-- Explicit shared-money operations are separate from the existing monthly
-- budget rows. They are additive and are only writable through the backend's
-- service-role RPCs after the API has checked the authenticated membership.
create table if not exists public.family_contribution_rules (
  rule_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  owner_user_id text not null,
  label text not null check (char_length(btrim(label)) between 1 and 100),
  amount numeric(14,2) not null check (amount > 0),
  day_of_month smallint not null check (day_of_month between 1 and 31),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (rule_id, family_id, owner_user_id),
  unique (family_id, owner_user_id, idempotency_key),
  foreign key (family_id, owner_user_id)
    references public.family_memberships(family_id, user_id) on delete cascade
);

create index if not exists family_contribution_rules_owner_idx
  on public.family_contribution_rules(owner_user_id, family_id, active);

create table if not exists public.family_financial_movements (
  movement_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  created_by_user_id text not null,
  kind text not null check (kind in ('cash_contribution', 'direct_family_expense')),
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null,
  description text not null check (char_length(btrim(description)) between 1 and 240),
  category_id text,
  source_rule_id text references public.family_contribution_rules(rule_id) on delete set null,
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (family_id, idempotency_key),
  foreign key (family_id, created_by_user_id)
    references public.family_memberships(family_id, user_id) on delete cascade
);

create index if not exists family_financial_movements_period_idx
  on public.family_financial_movements(family_id, occurred_on, kind);

create table if not exists public.family_reimbursements (
  reimbursement_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  expense_movement_id text not null unique references public.family_financial_movements(movement_id) on delete cascade,
  requested_by_user_id text not null,
  amount numeric(14,2) not null check (amount > 0),
  description text not null check (char_length(btrim(description)) between 1 and 240),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  foreign key (family_id, requested_by_user_id)
    references public.family_memberships(family_id, user_id) on delete cascade
);

create index if not exists family_reimbursements_status_idx
  on public.family_reimbursements(family_id, status, created_at);

create table if not exists public.family_reimbursement_payments (
  payment_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  reimbursement_id text not null unique references public.family_reimbursements(reimbursement_id) on delete cascade,
  paid_by_user_id text not null,
  amount numeric(14,2) not null check (amount > 0),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 160),
  paid_at timestamptz not null default now(),
  unique (family_id, idempotency_key),
  foreign key (family_id, paid_by_user_id)
    references public.family_memberships(family_id, user_id) on delete cascade
);

create index if not exists family_reimbursement_payments_family_idx
  on public.family_reimbursement_payments(family_id, paid_at);

alter table public.family_contribution_rules enable row level security;
alter table public.family_financial_movements enable row level security;
alter table public.family_reimbursements enable row level security;
alter table public.family_reimbursement_payments enable row level security;

revoke all on public.family_contribution_rules,
  public.family_financial_movements,
  public.family_reimbursements,
  public.family_reimbursement_payments from anon;
revoke insert, update, delete on public.family_contribution_rules,
  public.family_financial_movements,
  public.family_reimbursements,
  public.family_reimbursement_payments from authenticated;
grant select on public.family_contribution_rules,
  public.family_financial_movements,
  public.family_reimbursements,
  public.family_reimbursement_payments to authenticated;
grant all on public.family_contribution_rules,
  public.family_financial_movements,
  public.family_reimbursements,
  public.family_reimbursement_payments to service_role;

drop policy if exists family_contribution_rules_owner_only on public.family_contribution_rules;
create policy family_contribution_rules_owner_only on public.family_contribution_rules
  for all to authenticated
  using (owner_user_id = (select auth.uid())::text)
  with check (owner_user_id = (select auth.uid())::text);

drop policy if exists family_financial_movements_owner_read on public.family_financial_movements;
create policy family_financial_movements_owner_read on public.family_financial_movements
  for select to authenticated
  using (created_by_user_id = (select auth.uid())::text);

drop policy if exists family_reimbursements_requester_or_manager on public.family_reimbursements;
create policy family_reimbursements_requester_or_manager on public.family_reimbursements
  for select to authenticated
  using (
    requested_by_user_id = (select auth.uid())::text
    or exists (
      select 1 from public.family_memberships fm
      where fm.family_id = family_reimbursements.family_id
        and fm.user_id = (select auth.uid())::text
        and fm.role in ('owner', 'admin')
    )
  );

drop policy if exists family_reimbursement_payments_requester_or_manager on public.family_reimbursement_payments;
create policy family_reimbursement_payments_requester_or_manager on public.family_reimbursement_payments
  for select to authenticated
  using (
    exists (
      select 1 from public.family_reimbursements r
      where r.reimbursement_id = family_reimbursement_payments.reimbursement_id
        and (
          r.requested_by_user_id = (select auth.uid())::text
          or exists (
            select 1 from public.family_memberships fm
            where fm.family_id = r.family_id
              and fm.user_id = (select auth.uid())::text
              and fm.role in ('owner', 'admin')
          )
        )
    )
  );

-- One RPC is the transaction boundary for a contribution or direct family
-- expense. The unique family/idempotency key makes retries return the same
-- movement instead of creating a second financial event.
create or replace function public.record_family_financial_movement(
  p_family_id text,
  p_created_by_user_id text,
  p_kind text,
  p_amount numeric,
  p_occurred_on date,
  p_description text,
  p_idempotency_key text,
  p_category_id text default null,
  p_source_rule_id text default null,
  p_reimbursement_requested boolean default false
)
returns table (
  movement_id text,
  family_id text,
  created_by_user_id text,
  kind text,
  amount numeric,
  occurred_on date,
  description text,
  category_id text,
  source_rule_id text,
  reimbursement_id text,
  idempotent boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_movement public.family_financial_movements%rowtype;
  v_reimbursement_id text;
begin
  if p_kind not in ('cash_contribution', 'direct_family_expense') then
    raise exception 'Tipo de movimentação inválido';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor deve ser maior que zero';
  end if;
  if not exists (
    select 1 from public.family_memberships fm
    where fm.family_id = p_family_id and fm.user_id = p_created_by_user_id
  ) then
    raise exception 'Usuário não pertence à família';
  end if;
  if p_reimbursement_requested and p_kind <> 'direct_family_expense' then
    raise exception 'Somente despesa familiar direta pode gerar reembolso';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories c
    where c.category_id = p_category_id and c.family_id = p_family_id
  ) then
    raise exception 'Categoria não pertence à família';
  end if;
  if p_source_rule_id is not null and not exists (
    select 1 from public.family_contribution_rules cr
    where cr.rule_id = p_source_rule_id
      and cr.family_id = p_family_id
      and cr.owner_user_id = p_created_by_user_id
  ) then
    raise exception 'Regra de contribuição não pertence ao usuário';
  end if;

  insert into public.family_financial_movements (
    movement_id, family_id, created_by_user_id, kind, amount, occurred_on,
    description, category_id, source_rule_id, idempotency_key
  ) values (
    'fmove_' || replace(gen_random_uuid()::text, '-', ''), p_family_id,
    p_created_by_user_id, p_kind, round(p_amount, 2), p_occurred_on,
    btrim(p_description), p_category_id, p_source_rule_id, btrim(p_idempotency_key)
  )
  on conflict on constraint family_financial_movements_family_id_idempotency_key_key do nothing
  returning * into v_movement;

  if v_movement.movement_id is null then
    select * into v_movement from public.family_financial_movements m
    where m.family_id = p_family_id and m.idempotency_key = btrim(p_idempotency_key);
    select r.reimbursement_id into v_reimbursement_id
    from public.family_reimbursements r
    where r.expense_movement_id = v_movement.movement_id;
    return query select v_movement.movement_id, v_movement.family_id,
      v_movement.created_by_user_id, v_movement.kind, v_movement.amount,
      v_movement.occurred_on, v_movement.description, v_movement.category_id,
      v_movement.source_rule_id, v_reimbursement_id, true;
    return;
  end if;

  if p_reimbursement_requested then
    insert into public.family_reimbursements (
      reimbursement_id, family_id, expense_movement_id, requested_by_user_id,
      amount, description
    ) values (
      'freimb_' || replace(gen_random_uuid()::text, '-', ''), p_family_id,
      v_movement.movement_id, p_created_by_user_id, v_movement.amount,
      v_movement.description
    ) returning public.family_reimbursements.reimbursement_id into v_reimbursement_id;
  end if;

  return query select v_movement.movement_id, v_movement.family_id,
    v_movement.created_by_user_id, v_movement.kind, v_movement.amount,
    v_movement.occurred_on, v_movement.description, v_movement.category_id,
    v_movement.source_rule_id, v_reimbursement_id, false;
end;
$$;

revoke execute on function public.record_family_financial_movement(text, text, text, numeric, date, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_family_financial_movement(text, text, text, numeric, date, text, text, text, text, boolean) to service_role;

create or replace function public.materialize_family_contributions(
  p_family_id text,
  p_owner_user_id text,
  p_year integer,
  p_month integer
)
returns table (
  movement_id text,
  family_id text,
  created_by_user_id text,
  kind text,
  amount numeric,
  occurred_on date,
  description text,
  category_id text,
  source_rule_id text,
  reimbursement_id text,
  idempotent boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rule public.family_contribution_rules%rowtype;
  v_first_day date;
  v_occurred_on date;
begin
  if p_month not between 1 and 12 or p_year not between 2000 and 2200 then
    raise exception 'Período inválido';
  end if;
  if not exists (
    select 1 from public.family_memberships fm
    where fm.family_id = p_family_id and fm.user_id = p_owner_user_id
  ) then
    raise exception 'Usuário não pertence à família';
  end if;
  v_first_day := make_date(p_year, p_month, 1);
  for v_rule in
    select * from public.family_contribution_rules cr
    where cr.family_id = p_family_id
      and cr.owner_user_id = p_owner_user_id
      and cr.active
  loop
    v_occurred_on := v_first_day
      + least(v_rule.day_of_month,
              extract(day from (v_first_day + interval '1 month - 1 day'))::integer) - 1;
    return query
      select * from public.record_family_financial_movement(
        p_family_id, p_owner_user_id, 'cash_contribution', v_rule.amount,
        v_occurred_on, v_rule.label,
        format('auto:%s:%s-%s', v_rule.rule_id, p_year, lpad(p_month::text, 2, '0')),
        null, v_rule.rule_id, false
      );
  end loop;
end;
$$;

revoke execute on function public.materialize_family_contributions(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.materialize_family_contributions(text, text, integer, integer) to service_role;

create or replace function public.pay_family_reimbursement(
  p_family_id text,
  p_reimbursement_id text,
  p_paid_by_user_id text,
  p_idempotency_key text
)
returns table (
  payment_id text,
  family_id text,
  reimbursement_id text,
  paid_by_user_id text,
  amount numeric,
  paid_at timestamptz,
  idempotent boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reimbursement public.family_reimbursements%rowtype;
  v_payment public.family_reimbursement_payments%rowtype;
begin
  if not exists (
    select 1 from public.family_memberships fm
    where fm.family_id = p_family_id
      and fm.user_id = p_paid_by_user_id
      and fm.role in ('owner', 'admin')
  ) then
    raise exception 'Somente proprietário ou administrador pode pagar reembolso';
  end if;

  select * into v_payment from public.family_reimbursement_payments p
  where p.family_id = p_family_id and p.idempotency_key = btrim(p_idempotency_key);
  if v_payment.payment_id is not null then
    return query select v_payment.payment_id, v_payment.family_id,
      v_payment.reimbursement_id, v_payment.paid_by_user_id, v_payment.amount,
      v_payment.paid_at, true;
    return;
  end if;

  select * into v_reimbursement from public.family_reimbursements r
  where r.family_id = p_family_id and r.reimbursement_id = p_reimbursement_id;
  if v_reimbursement.reimbursement_id is null then
    raise exception 'Reembolso não encontrado';
  end if;
  if v_reimbursement.status = 'cancelled' then
    raise exception 'Reembolso cancelado';
  end if;

  insert into public.family_reimbursement_payments (
    payment_id, family_id, reimbursement_id, paid_by_user_id, amount, idempotency_key
  ) values (
    'fpay_' || replace(gen_random_uuid()::text, '-', ''), p_family_id,
    v_reimbursement.reimbursement_id, p_paid_by_user_id, v_reimbursement.amount,
    btrim(p_idempotency_key)
  )
  on conflict on constraint family_reimbursement_payments_reimbursement_id_key do nothing
  returning * into v_payment;

  if v_payment.payment_id is null then
    select * into v_payment from public.family_reimbursement_payments p
    where p.reimbursement_id = p_reimbursement_id;
    return query select v_payment.payment_id, v_payment.family_id,
      v_payment.reimbursement_id, v_payment.paid_by_user_id, v_payment.amount,
      v_payment.paid_at, true;
    return;
  end if;

  update public.family_reimbursements
  set status = 'paid', settled_at = v_payment.paid_at
  where family_reimbursements.reimbursement_id = v_reimbursement.reimbursement_id;

  return query select v_payment.payment_id, v_payment.family_id,
    v_payment.reimbursement_id, v_payment.paid_by_user_id, v_payment.amount,
    v_payment.paid_at, false;
end;
$$;

revoke execute on function public.pay_family_reimbursement(text, text, text, text) from public, anon, authenticated;
grant execute on function public.pay_family_reimbursement(text, text, text, text) to service_role;

comment on table public.family_financial_movements is
  'Explicit shared contributions and direct family expenses; never reclassifies legacy monthly entries.';
comment on table public.family_reimbursements is
  'Pending obligation created by a direct family expense paid from personal resources.';
comment on table public.family_reimbursement_payments is
  'Cash settlement of a reimbursement; excluded from operational income and expense totals.';
