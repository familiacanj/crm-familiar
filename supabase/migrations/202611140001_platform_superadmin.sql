-- Global CRM Familiar administration, separate from family roles.
-- Additive only. No financial tables or existing records are modified.

create table if not exists public.platform_superadmins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'superadmin' check (role = 'superadmin'),
  granted_at timestamptz not null default now(),
  grant_source text not null default 'verified_identity_bootstrap'
    check (grant_source in ('verified_identity_bootstrap', 'authorized_admin_grant'))
);

create table if not exists public.platform_admin_audit (
  audit_id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'platform.dashboard.viewed',
    'platform.families.listed',
    'platform.audit.viewed'
  )),
  target_family_id text references public.families(family_id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_admin_audit_created_idx
  on public.platform_admin_audit(created_at desc);
create index if not exists platform_admin_audit_actor_created_idx
  on public.platform_admin_audit(actor_user_id, created_at desc);

-- Reserve a safe draft schema for future platform-wide announcements.
-- This release provides no send, publish, or scheduling operation.
create table if not exists public.platform_announcements (
  announcement_id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  status text not null default 'draft' check (status = 'draft'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_superadmins enable row level security;
alter table public.platform_admin_audit enable row level security;
alter table public.platform_announcements enable row level security;

-- No authenticated/anonymous policies are defined. The backend uses its
-- server-only service role after validating the caller's Supabase JWT.
revoke all on public.platform_superadmins, public.platform_admin_audit,
  public.platform_announcements from public, anon, authenticated;
grant all on public.platform_superadmins, public.platform_admin_audit,
  public.platform_announcements to service_role;

create or replace function public.platform_admin_overview()
returns table (
  families_count bigint,
  users_count bigint,
  users_without_family_count bigint,
  families_without_members_count bigint,
  pending_invites_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    (select count(*) from public.families),
    (select count(*) from auth.users),
    (select count(*) from auth.users u
      where not exists (
        select 1 from public.family_memberships fm where fm.user_id = u.id::text
      )),
    (select count(*) from public.families f
      where not exists (
        select 1 from public.family_memberships fm where fm.family_id = f.family_id
      )),
    (select count(*) from public.family_invites i
      where i.used_at is null and i.cancelled_at is null and i.expires_at > now());
$$;

create or replace function public.platform_admin_list_families(
  p_limit integer default 50,
  p_offset integer default 0,
  p_query text default null
)
returns table (
  family_id text,
  family_name text,
  created_at timestamptz,
  member_count bigint,
  active_invites_count bigint,
  status text
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select f.family_id, f.name, f.created_at,
    (select count(*) from public.family_memberships fm where fm.family_id = f.family_id),
    (select count(*) from public.family_invites i
      where i.family_id = f.family_id and i.used_at is null and i.cancelled_at is null and i.expires_at > now()),
    case when exists (select 1 from public.family_memberships fm where fm.family_id = f.family_id)
      then 'active' else 'without_members' end
  from public.families f
  where p_query is null or btrim(p_query) = '' or f.name ilike ('%' || btrim(p_query) || '%')
  order by f.created_at desc, f.family_id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.platform_admin_overview() from public, anon, authenticated;
revoke all on function public.platform_admin_list_families(integer, integer, text) from public, anon, authenticated;
grant execute on function public.platform_admin_overview() to service_role;
grant execute on function public.platform_admin_list_families(integer, integer, text) to service_role;

-- Bootstrap exactly the owner-authorized, Google-verified identity. Fail the
-- migration closed if the UUID does not match the verified account.
do $$
begin
  if not exists (
    select 1 from auth.users u
    where u.id = 'f4f0c80e-79b0-4ec0-8e57-159c3cedb914'::uuid
      and lower(u.email) = 'ajudapopular@gmail.com'
      and u.email_confirmed_at is not null
  ) then
    raise exception 'Authorized verified Superadministrator identity was not found';
  end if;
end;
$$;

insert into public.platform_superadmins (user_id, role, grant_source)
select u.id, 'superadmin', 'verified_identity_bootstrap'
from auth.users u
where u.id = 'f4f0c80e-79b0-4ec0-8e57-159c3cedb914'::uuid
  and lower(u.email) = 'ajudapopular@gmail.com'
  and u.email_confirmed_at is not null
on conflict (user_id) do nothing;
