-- CRM Familiar: secure, single-use family invitations.
-- This migration is additive. Legacy family invite_code remains in place for
-- compatibility, but the application no longer presents it to users.

alter table public.families
  add column if not exists owner_user_id text;

alter table public.profiles
  add column if not exists family_role text not null default 'member';

alter table public.profiles
  drop constraint if exists profiles_family_role_check;

alter table public.profiles
  add constraint profiles_family_role_check
  check (family_role in ('owner', 'admin', 'member'));

create table if not exists public.family_invites (
  invite_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  token_hash text not null unique,
  created_by text not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by text references public.profiles(user_id) on delete set null,
  cancelled_at timestamptz,
  check (expires_at > created_at)
);

create index if not exists family_invites_family_created_idx
  on public.family_invites(family_id, created_at desc);

create index if not exists family_invites_expires_idx
  on public.family_invites(expires_at);

-- Existing families were created before roles existed. Their owner is left
-- unset until it is explicitly identified; guessing from row order could
-- grant invitation privileges to the wrong person. New families always set
-- owner_user_id and family_role atomically in the API.

alter table public.family_invites enable row level security;

drop policy if exists family_invites_service_role_only on public.family_invites;
create policy family_invites_service_role_only on public.family_invites
  for all to service_role
  using (true)
  with check (true);

grant all on public.family_invites to service_role;

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
begin
  select * into invitation
  from public.family_invites
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'invite_invalid';
  end if;
  if invitation.cancelled_at is not null then
    raise exception using errcode = 'P0001', message = 'invite_cancelled';
  end if;
  if invitation.used_at is not null then
    raise exception using errcode = 'P0001', message = 'invite_used';
  end if;
  if invitation.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'invite_expired';
  end if;

  select * into current_profile
  from public.profiles
  where user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'user_invalid';
  end if;
  if current_profile.family_id is not null then
    if current_profile.family_id = invitation.family_id then
      raise exception using errcode = 'P0001', message = 'user_already_member';
    end if;
    raise exception using errcode = 'P0001', message = 'user_already_family';
  end if;

  next_name := nullif(btrim(coalesce(p_display_name, '')), '');
  update public.profiles
  set family_id = invitation.family_id,
      family_role = 'member',
      name = coalesce(next_name, name)
  where user_id = p_user_id;

  update public.family_invites
  set used_at = now(), used_by = p_user_id
  where invite_id = invitation.invite_id;

  return jsonb_build_object(
    'family_id', invitation.family_id,
    'invite_id', invitation.invite_id
  );
end;
$$;

revoke all on function public.accept_family_invite(text, text, text) from public;
grant execute on function public.accept_family_invite(text, text, text) to service_role;
