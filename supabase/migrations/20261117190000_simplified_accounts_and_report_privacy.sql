-- Simplified personal ledger, family cash expenses, report credentials,
-- adult consent, and explicitly designated guardians for minors.
-- Additive only: no existing financial or identity rows are deleted/replaced.

alter table public.family_memberships
  add column if not exists date_of_birth date,
  add column if not exists report_sharing_authorized boolean not null default false;

alter table public.personal_expense_transactions
  add column if not exists category_id text references public.categories(category_id) on delete set null;

create table if not exists public.personal_income_transactions (
  transaction_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  owner_user_id text not null,
  category_id text references public.categories(category_id) on delete set null,
  occurred_on date not null,
  amount numeric(14,2) not null check (amount > 0),
  description text not null check (char_length(btrim(description)) between 1 and 240),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (family_id, owner_user_id, idempotency_key),
  foreign key (family_id, owner_user_id)
    references public.family_memberships(family_id, user_id) on delete cascade
);

create index if not exists personal_income_transactions_owner_period_idx
  on public.personal_income_transactions(owner_user_id, family_id, occurred_on);

alter table public.personal_income_transactions enable row level security;
revoke all on public.personal_income_transactions from anon;
revoke insert, update, delete on public.personal_income_transactions from authenticated;
grant select on public.personal_income_transactions to authenticated;
grant all on public.personal_income_transactions to service_role;

drop policy if exists personal_income_transactions_owner_only
  on public.personal_income_transactions;
create policy personal_income_transactions_owner_only
  on public.personal_income_transactions for select to authenticated
  using (owner_user_id = (select auth.uid())::text);

create table if not exists public.family_minor_guardians (
  family_id text not null references public.families(family_id) on delete cascade,
  minor_user_id text not null,
  guardian_user_id text not null,
  granted_by_user_id text not null,
  minor_birth_date date not null,
  created_at timestamptz not null default now(),
  primary key (family_id, minor_user_id, guardian_user_id),
  check (minor_user_id <> guardian_user_id),
  foreign key (family_id, minor_user_id)
    references public.family_memberships(family_id, user_id) on delete cascade,
  foreign key (family_id, guardian_user_id)
    references public.family_memberships(family_id, user_id) on delete cascade,
  foreign key (family_id, granted_by_user_id)
    references public.family_memberships(family_id, user_id) on delete cascade
);

create index if not exists family_minor_guardians_guardian_idx
  on public.family_minor_guardians(family_id, guardian_user_id, minor_user_id);

alter table public.family_minor_guardians enable row level security;
revoke all on public.family_minor_guardians from anon;
revoke insert, update, delete on public.family_minor_guardians from authenticated;
grant select on public.family_minor_guardians to authenticated;
grant all on public.family_minor_guardians to service_role;

drop policy if exists family_minor_guardians_guardian_read
  on public.family_minor_guardians;
create policy family_minor_guardians_guardian_read
  on public.family_minor_guardians for select to authenticated
  using (guardian_user_id = (select auth.uid())::text);

drop policy if exists personal_expense_transactions_minor_guardian_read
  on public.personal_expense_transactions;
create policy personal_expense_transactions_minor_guardian_read
  on public.personal_expense_transactions for select to authenticated
  using (
    exists (
      select 1 from public.family_minor_guardians g
      where g.family_id = personal_expense_transactions.family_id
        and g.minor_user_id = personal_expense_transactions.owner_user_id
        and g.guardian_user_id = (select auth.uid())::text
        and current_date < (g.minor_birth_date + interval '18 years')::date
    )
  );

drop policy if exists personal_income_transactions_minor_guardian_read
  on public.personal_income_transactions;
create policy personal_income_transactions_minor_guardian_read
  on public.personal_income_transactions for select to authenticated
  using (
    exists (
      select 1 from public.family_minor_guardians g
      where g.family_id = personal_income_transactions.family_id
        and g.minor_user_id = personal_income_transactions.owner_user_id
        and g.guardian_user_id = (select auth.uid())::text
        and current_date < (g.minor_birth_date + interval '18 years')::date
    )
  );

drop policy if exists personal_financial_items_minor_guardian_read
  on public.personal_financial_items;
create policy personal_financial_items_minor_guardian_read
  on public.personal_financial_items for select to authenticated
  using (
    exists (
      select 1 from public.family_minor_guardians g
      where g.family_id = personal_financial_items.family_id
        and g.minor_user_id = personal_financial_items.owner_user_id
        and g.guardian_user_id = (select auth.uid())::text
        and current_date < (g.minor_birth_date + interval '18 years')::date
    )
  );

drop policy if exists personal_financial_entries_minor_guardian_read
  on public.personal_financial_entries;
create policy personal_financial_entries_minor_guardian_read
  on public.personal_financial_entries for select to authenticated
  using (
    exists (
      select 1 from public.family_minor_guardians g
      where g.family_id = personal_financial_entries.family_id
        and g.minor_user_id = personal_financial_entries.owner_user_id
        and g.guardian_user_id = (select auth.uid())::text
        and current_date < (g.minor_birth_date + interval '18 years')::date
    )
  );

-- Record adult sharing changes only through the authenticated server API.
create table if not exists public.family_report_access_audit (
  audit_id text primary key default gen_random_uuid()::text,
  family_id text not null references public.families(family_id) on delete cascade,
  actor_user_id text not null,
  subject_user_id text not null,
  action text not null check (action in ('adult_reports_granted', 'adult_reports_revoked', 'minor_guardian_granted', 'minor_guardian_revoked')),
  related_user_id text,
  created_at timestamptz not null default now(),
  foreign key (family_id, actor_user_id)
    references public.family_memberships(family_id, user_id) on delete cascade,
  foreign key (family_id, subject_user_id)
    references public.family_memberships(family_id, user_id) on delete cascade
);

create index if not exists family_report_access_audit_subject_idx
  on public.family_report_access_audit(family_id, subject_user_id, created_at desc);

alter table public.family_report_access_audit enable row level security;
revoke all on public.family_report_access_audit from anon, authenticated;
grant all on public.family_report_access_audit to service_role;

-- Server-only salted password hashes and failed-attempt timestamps.
create table if not exists public.user_report_passwords (
  user_id text primary key references public.profiles(user_id) on delete cascade,
  password_salt text not null,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_report_password_attempts (
  attempt_id text primary key default gen_random_uuid()::text,
  user_id text not null references public.profiles(user_id) on delete cascade,
  occurred_at timestamptz not null default now(),
  succeeded boolean not null default false
);

create table if not exists public.user_report_password_recovery (
  user_id text primary key references public.profiles(user_id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_report_password_attempts_window_idx
  on public.user_report_password_attempts(user_id, occurred_at desc);

alter table public.user_report_passwords enable row level security;
alter table public.user_report_password_attempts enable row level security;
alter table public.user_report_password_recovery enable row level security;
revoke all on public.user_report_passwords, public.user_report_password_attempts,
  public.user_report_password_recovery from anon, authenticated;
grant all on public.user_report_passwords, public.user_report_password_attempts,
  public.user_report_password_recovery to service_role;

-- Extend the existing shared-movement kind constraint without changing rows.
do $$
declare
  existing_constraint text;
begin
  select c.conname into existing_constraint
  from pg_constraint c
  where c.conrelid = 'public.family_financial_movements'::regclass
    and c.contype = 'c'
    and c.conname = 'family_financial_movements_kind_check';
  if existing_constraint is not null then
    execute format('alter table public.family_financial_movements drop constraint %I', existing_constraint);
  end if;
  alter table public.family_financial_movements
    add constraint family_financial_movements_kind_check
    check (kind in ('cash_contribution', 'direct_family_expense', 'personal_to_family_transfer', 'family_to_personal_transfer', 'family_cash_expense'));
end;
$$;

create or replace function public.record_personal_expense_transaction_v2(
  p_family_id text,
  p_owner_user_id text,
  p_scope text,
  p_description text,
  p_occurred_on date,
  p_total_amount numeric,
  p_personal_amount numeric,
  p_family_amount numeric,
  p_category_id text,
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
  v_result record;
  v_existing_category text;
begin
  if p_category_id is not null and not exists (
    select 1 from public.categories c where c.family_id = p_family_id and c.category_id = p_category_id
  ) then raise exception 'expense_category_invalid'; end if;
  select * into v_result from public.record_personal_expense_transaction(
    p_family_id, p_owner_user_id, p_scope, p_description, p_occurred_on,
    p_total_amount, p_personal_amount, p_family_amount, p_idempotency_key
  );
  select t.category_id into v_existing_category from public.personal_expense_transactions t
    where t.transaction_id = v_result.transaction_id for update;
  if v_result.idempotent and v_existing_category is distinct from p_category_id then
    raise exception 'expense_idempotency_category_reused';
  end if;
  update public.personal_expense_transactions t set category_id = p_category_id
    where t.transaction_id = v_result.transaction_id and t.category_id is null;
  update public.family_financial_movements m set category_id = p_category_id
    where m.source_personal_expense_id = v_result.transaction_id and m.category_id is null;
  return query select v_result.transaction_id, v_result.family_id, v_result.owner_user_id,
    v_result.scope, v_result.description, v_result.occurred_on, v_result.total_amount,
    v_result.personal_amount, v_result.family_amount, v_result.family_movement_id,
    v_result.idempotent;
end;
$$;

revoke all on function public.record_personal_expense_transaction_v2(text, text, text, text, date, numeric, numeric, numeric, text, text) from public, anon, authenticated;
grant execute on function public.record_personal_expense_transaction_v2(text, text, text, text, date, numeric, numeric, numeric, text, text) to service_role;

create or replace function public.record_personal_income_transaction(
  p_family_id text,
  p_owner_user_id text,
  p_category_id text,
  p_occurred_on date,
  p_amount numeric,
  p_description text,
  p_idempotency_key text
)
returns table (transaction_id text, idempotent boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.personal_income_transactions%rowtype;
  v_key text := btrim(p_idempotency_key);
begin
  if p_amount is null or p_amount <= 0 or p_occurred_on is null
    or char_length(btrim(coalesce(p_description, ''))) not between 1 and 240
    or char_length(v_key) not between 1 and 160 then
    raise exception 'personal_income_invalid';
  end if;
  if not exists (select 1 from public.family_memberships fm
    where fm.family_id = p_family_id and fm.user_id = p_owner_user_id) then
    raise exception 'personal_income_membership_required';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories c where c.family_id = p_family_id and c.category_id = p_category_id
  ) then raise exception 'personal_income_category_invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_family_id || ':income:' || p_owner_user_id || ':' || v_key, 0));
  select * into v_row from public.personal_income_transactions t
    where t.family_id = p_family_id and t.owner_user_id = p_owner_user_id and t.idempotency_key = v_key;
  if found then
    if v_row.amount <> p_amount or v_row.description <> btrim(p_description)
      or v_row.occurred_on <> p_occurred_on or v_row.category_id is distinct from p_category_id then
      raise exception 'personal_income_idempotency_key_reused';
    end if;
    return query select v_row.transaction_id, true;
    return;
  end if;

  insert into public.personal_income_transactions (
    transaction_id, family_id, owner_user_id, category_id, occurred_on, amount, description, idempotency_key
  ) values (
    gen_random_uuid()::text, p_family_id, p_owner_user_id, p_category_id, p_occurred_on,
    round(p_amount, 2), btrim(p_description), v_key
  ) returning * into v_row;
  return query select v_row.transaction_id, false;
end;
$$;

revoke all on function public.record_personal_income_transaction(text, text, text, date, numeric, text, text) from public, anon, authenticated;
grant execute on function public.record_personal_income_transaction(text, text, text, date, numeric, text, text) to service_role;

create or replace function public.record_family_cash_expense(
  p_family_id text,
  p_created_by_user_id text,
  p_amount numeric,
  p_occurred_on date,
  p_description text,
  p_category_id text,
  p_idempotency_key text
)
returns table (movement_id text, idempotent boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.family_financial_movements%rowtype;
  v_key text := btrim(p_idempotency_key);
begin
  if p_amount is null or p_amount <= 0 or p_occurred_on is null
    or char_length(btrim(coalesce(p_description, ''))) not between 1 and 240
    or char_length(v_key) not between 1 and 160 then
    raise exception 'family_cash_expense_invalid';
  end if;
  if not exists (select 1 from public.family_memberships fm
    where fm.family_id = p_family_id and fm.user_id = p_created_by_user_id and fm.role in ('owner', 'admin')) then
    raise exception 'family_cash_expense_manager_required';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories c where c.family_id = p_family_id and c.category_id = p_category_id
  ) then raise exception 'family_cash_expense_category_invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_family_id || ':cash-expense:' || v_key, 0));
  select * into v_row from public.family_financial_movements m
    where m.family_id = p_family_id and m.idempotency_key = v_key;
  if found then
    if v_row.kind <> 'family_cash_expense' or v_row.amount <> round(p_amount, 2)
      or v_row.description <> btrim(p_description) or v_row.occurred_on <> p_occurred_on
      or v_row.category_id is distinct from p_category_id
      or v_row.created_by_user_id <> p_created_by_user_id then
      raise exception 'family_cash_expense_idempotency_key_reused';
    end if;
    return query select v_row.movement_id, true;
    return;
  end if;

  insert into public.family_financial_movements (
    movement_id, family_id, created_by_user_id, kind, amount, occurred_on, description,
    category_id, idempotency_key
  ) values (
    gen_random_uuid()::text, p_family_id, p_created_by_user_id, 'family_cash_expense',
    round(p_amount, 2), p_occurred_on, btrim(p_description), p_category_id, v_key
  ) returning * into v_row;
  return query select v_row.movement_id, false;
end;
$$;

revoke all on function public.record_family_cash_expense(text, text, numeric, date, text, text, text) from public, anon, authenticated;
grant execute on function public.record_family_cash_expense(text, text, numeric, date, text, text, text) to service_role;

comment on table public.personal_income_transactions is
  'Dated, repeatable personal income entries. Owner-only; guardian access to minors is time-limited by birth date.';
comment on table public.family_minor_guardians is
  'Explicit, auditable guardian authorization. Access expires automatically on the minor 18th birthday.';
comment on table public.user_report_passwords is
  'Server-only salted hashes for the separate annual-report gate; never expose hashes or salts to clients.';
