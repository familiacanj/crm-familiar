-- Shared monthly contribution commitments. Existing financial history and
-- legacy salary reference values are preserved; authenticated clients can no
-- longer read the legacy salary column directly.
create table if not exists public.family_monthly_commitments (
  family_id text not null references public.families(family_id) on delete cascade,
  member_id text not null references public.members(member_id) on delete cascade,
  effective_year integer not null check (effective_year between 2000 and 2200),
  effective_month integer not null check (effective_month between 1 and 12),
  amount numeric(12,2) not null check (amount >= 0),
  set_by_user_id text not null,
  created_at timestamptz not null default now(),
  primary key (family_id, member_id, effective_year, effective_month)
);

create index if not exists family_monthly_commitments_effective_idx
  on public.family_monthly_commitments (family_id, effective_year, effective_month);

alter table public.family_monthly_commitments enable row level security;
revoke all on table public.family_monthly_commitments from public, anon, authenticated;
grant select (family_id, member_id, effective_year, effective_month, amount, created_at)
  on table public.family_monthly_commitments to authenticated;
grant all on table public.family_monthly_commitments to service_role;

drop policy if exists family_monthly_commitments_member_read on public.family_monthly_commitments;
create policy family_monthly_commitments_member_read
  on public.family_monthly_commitments
  for select to authenticated
  using (exists (
    select 1 from public.family_memberships fm
    where fm.family_id = family_monthly_commitments.family_id
      and fm.user_id = (select auth.uid())::text
  ));

-- Column grants are additive in Postgres, so first remove table-wide SELECT
-- and grant back only the non-private member fields.
revoke all on table public.members from anon, authenticated;
grant select (
  member_id, family_id, name, color, "order", created_at,
  photo_path, linked_user_id, relationship
) on table public.members to authenticated;
