-- CRM Familiar: additive support for family memberships, person photos, and
-- real foreground access timestamps. Existing profile and finance rows remain.

create table if not exists public.family_memberships (
  family_id text not null references public.families(family_id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  last_access_at timestamptz,
  primary key (family_id, user_id)
);

create index if not exists family_memberships_user_idx
  on public.family_memberships(user_id, joined_at);

-- A profile can be elevated in at most one family; ordinary memberships may be many.
create unique index if not exists family_memberships_one_elevated_family_idx
  on public.family_memberships(user_id)
  where role in ('owner', 'admin');

-- Backfill only the currently recorded family/role. This is additive and does
-- not change or remove the compatibility fields on profiles.
insert into public.family_memberships (family_id, user_id, role)
select family_id, user_id, family_role
from public.profiles
where family_id is not null
on conflict (family_id, user_id) do nothing;

alter table public.members
  add column if not exists photo_path text,
  add column if not exists linked_user_id text references public.profiles(user_id) on delete set null;

create unique index if not exists members_family_linked_user_unique
  on public.members(family_id, linked_user_id)
  where linked_user_id is not null;

alter table public.family_memberships enable row level security;

drop policy if exists family_memberships_select_self on public.family_memberships;
create policy family_memberships_select_self on public.family_memberships
  for select to authenticated using (user_id = auth.uid()::text);

grant select on public.family_memberships to authenticated;
grant all on public.family_memberships to service_role;
grant all on public.members to service_role;

-- Private image storage. Access is mediated by the CRM API using its server-only
-- service role and short-lived signed URLs; no public bucket or public client key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-member-photos', 'family-member-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from storage.buckets where id = 'family-member-photos' and public) then
    raise exception 'family-member-photos bucket already exists as public; review it before continuing';
  end if;
end;
$$;

create or replace function public.accept_family_invite(
  p_token_hash text,
  p_user_id text,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.family_invites%rowtype;
  current_profile public.profiles%rowtype;
  next_name text;
  elevated_memberships integer;
begin
  select * into invitation
  from public.family_invites
  where token_hash = p_token_hash
  for update;

  if not found then raise exception using errcode = 'P0001', message = 'invite_invalid'; end if;
  if invitation.cancelled_at is not null then raise exception using errcode = 'P0001', message = 'invite_cancelled'; end if;
  if invitation.used_at is not null then raise exception using errcode = 'P0001', message = 'invite_used'; end if;
  if invitation.expires_at <= now() then raise exception using errcode = 'P0001', message = 'invite_expired'; end if;

  select * into current_profile
  from public.profiles
  where user_id = p_user_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'user_invalid'; end if;

  if exists (
    select 1 from public.family_memberships
    where user_id = p_user_id and family_id = invitation.family_id
  ) then
    raise exception using errcode = 'P0001', message = 'user_already_member';
  end if;

  select count(*) into elevated_memberships
  from public.family_memberships
  where user_id = p_user_id and role in ('owner', 'admin');
  if elevated_memberships > 0 or current_profile.family_role in ('owner', 'admin') then
    raise exception using errcode = 'P0001', message = 'user_elevated_cannot_join';
  end if;

  next_name := nullif(btrim(coalesce(p_display_name, '')), '');
  insert into public.family_memberships (family_id, user_id, role)
  values (invitation.family_id, p_user_id, 'member');

  -- profiles.family_id/family_role remain the active-family compatibility
  -- fields used by existing endpoints and RLS; a member may switch among any
  -- of their memberships without changing the membership records.
  update public.profiles
  set family_id = invitation.family_id,
      family_role = 'member',
      name = coalesce(next_name, name)
  where user_id = p_user_id;

  update public.family_invites
  set used_at = now(), used_by = p_user_id
  where invite_id = invitation.invite_id;

  return jsonb_build_object('family_id', invitation.family_id, 'invite_id', invitation.invite_id);
end;
$$;

revoke all on function public.accept_family_invite(text, text, text) from public;
grant execute on function public.accept_family_invite(text, text, text) to service_role;

create or replace function public.set_family_member_role(
  p_family_id text,
  p_actor_user_id text,
  p_target_user_id text,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  target_memberships integer;
  target_profile_id text;
begin
  if p_role not in ('admin', 'member') then
    raise exception using errcode = 'P0001', message = 'role_invalid';
  end if;

  select role into actor_role from public.family_memberships
  where family_id = p_family_id and user_id = p_actor_user_id for update;
  if coalesce(actor_role, '') <> 'owner' then
    raise exception using errcode = 'P0001', message = 'role_owner_required';
  end if;

  if not exists (select 1 from public.family_memberships where family_id = p_family_id and user_id = p_target_user_id) then
    raise exception using errcode = 'P0001', message = 'target_not_member';
  end if;
  if exists (select 1 from public.family_memberships where family_id = p_family_id and user_id = p_target_user_id and role = 'owner') then
    raise exception using errcode = 'P0001', message = 'owner_role_immutable';
  end if;

  if p_role = 'admin' then
    select user_id into target_profile_id from public.profiles where user_id = p_target_user_id for update;
    select count(*) into target_memberships from public.family_memberships where user_id = p_target_user_id;
    if target_memberships > 1 then
      raise exception using errcode = 'P0001', message = 'multi_family_admin_forbidden';
    end if;
  end if;

  update public.family_memberships set role = p_role
  where family_id = p_family_id and user_id = p_target_user_id;
  update public.profiles set family_role = p_role
  where user_id = p_target_user_id and family_id = p_family_id;
end;
$$;

revoke all on function public.set_family_member_role(text, text, text, text) from public;
grant execute on function public.set_family_member_role(text, text, text, text) to service_role;
