-- CRM Familiar: relational schema for the Supabase migration.
-- The application starts with an empty Supabase project, so this migration
-- intentionally creates the tables without importing legacy MongoDB data.

create table if not exists public.families (
  family_id text primary key,
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id text primary key,
  email text not null unique,
  name text not null default '',
  picture text,
  family_id text references public.families(family_id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  member_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  name text not null,
  color text not null default '#3B825C',
  default_income numeric not null default 0,
  "order" integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  category_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  kind text not null check (kind in ('income_extra', 'fixed', 'variable')),
  name text not null,
  icon text not null,
  default_value numeric not null default 0,
  member_id text references public.members(member_id) on delete set null,
  due_day integer,
  "order" integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.entries (
  family_id text not null references public.families(family_id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  ref_type text not null check (ref_type in ('member', 'category')),
  ref_id text not null,
  value numeric not null default 0,
  created_at timestamptz not null default now(),
  primary key (family_id, year, month, ref_id)
);

create table if not exists public.bill_payments (
  family_id text not null references public.families(family_id) on delete cascade,
  category_id text not null references public.categories(category_id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  paid_at timestamptz not null default now(),
  primary key (family_id, category_id, year, month)
);

create table if not exists public.goals (
  goal_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  name text not null,
  icon text not null,
  target numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.goal_deposits (
  goal_id text not null references public.goals(goal_id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  amount numeric not null default 0,
  primary key (goal_id, year, month)
);

create index if not exists profiles_family_id_idx on public.profiles(family_id);
create index if not exists members_family_id_order_idx on public.members(family_id, "order");
create index if not exists categories_family_id_order_idx on public.categories(family_id, "order");
create index if not exists entries_family_year_month_idx on public.entries(family_id, year, month);
create index if not exists bill_payments_family_period_idx on public.bill_payments(family_id, year, month);
create index if not exists goals_family_created_at_idx on public.goals(family_id, created_at);

create or replace function public.current_family_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.profiles where user_id = auth.uid()::text;
$$;

alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.categories enable row level security;
alter table public.entries enable row level security;
alter table public.bill_payments enable row level security;
alter table public.goals enable row level security;
alter table public.goal_deposits enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = auth.uid()::text);

drop policy if exists families_by_membership on public.families;
create policy families_by_membership on public.families
  for all to authenticated
  using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

drop policy if exists members_by_family on public.members;
create policy members_by_family on public.members
  for all to authenticated
  using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

drop policy if exists categories_by_family on public.categories;
create policy categories_by_family on public.categories
  for all to authenticated
  using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

drop policy if exists entries_by_family on public.entries;
create policy entries_by_family on public.entries
  for all to authenticated
  using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

drop policy if exists bill_payments_by_family on public.bill_payments;
create policy bill_payments_by_family on public.bill_payments
  for all to authenticated
  using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

drop policy if exists goals_by_family on public.goals;
create policy goals_by_family on public.goals
  for all to authenticated
  using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

drop policy if exists goal_deposits_by_family on public.goal_deposits;
create policy goal_deposits_by_family on public.goal_deposits
  for all to authenticated
  using (
    exists (
      select 1 from public.goals
      where goals.goal_id = goal_deposits.goal_id
        and goals.family_id = public.current_family_id()
    )
  )
  with check (
    exists (
      select 1 from public.goals
      where goals.goal_id = goal_deposits.goal_id
        and goals.family_id = public.current_family_id()
    )
  );

grant usage on schema public to authenticated, service_role;
grant select on public.families, public.profiles, public.members, public.categories,
  public.entries, public.bill_payments, public.goals, public.goal_deposits to authenticated;
grant all on public.families, public.profiles, public.members, public.categories,
  public.entries, public.bill_payments, public.goals, public.goal_deposits to service_role;
grant execute on function public.current_family_id() to authenticated, service_role;
