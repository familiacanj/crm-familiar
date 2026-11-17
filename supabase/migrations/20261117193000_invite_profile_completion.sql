-- Family-scoped relationship and mandatory profile completion for invitees.
-- Additive only: existing memberships remain complete by default, and no
-- existing profile, financial row, role, or invitation is deleted or rewritten.

alter table public.family_memberships
  add column if not exists relationship text,
  add column if not exists profile_completion_required boolean not null default false;

comment on column public.family_memberships.relationship is
  'Descriptive family relationship for this membership; never grants access.';
comment on column public.family_memberships.profile_completion_required is
  'Invitees must complete name, birth date, and relationship before using app routes.';

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
  if invitation.used_at is not null or invitation.used_by is not null then
    raise exception using errcode = 'P0001', message = 'invite_used';
  end if;
  if invitation.expires_at <= now() then raise exception using errcode = 'P0001', message = 'invite_expired'; end if;

  select * into current_profile
  from public.profiles
  where user_id = p_user_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'user_invalid'; end if;

  if exists (
    select 1 from public.family_memberships
    where user_id = p_user_id and family_id = invitation.family_id
  ) then raise exception using errcode = 'P0001', message = 'user_already_member'; end if;

  select count(*) into elevated_memberships
  from public.family_memberships
  where user_id = p_user_id and role in ('owner', 'admin');
  if elevated_memberships > 0 or current_profile.family_role in ('owner', 'admin') then
    raise exception using errcode = 'P0001', message = 'user_elevated_cannot_join';
  end if;

  next_name := nullif(left(btrim(coalesce(p_display_name, '')), 80), '');
  insert into public.family_memberships (
    family_id, user_id, role, display_name, profile_completion_required
  )
  values (
    invitation.family_id,
    p_user_id,
    'member',
    coalesce(next_name, nullif(btrim(current_profile.name), '')),
    true
  );

  -- Keep the app-selected name family-scoped and the Auth identity unchanged.
  update public.profiles
  set family_id = invitation.family_id,
      family_role = 'member'
  where user_id = p_user_id;

  update public.family_invites
  set used_at = now(), used_by = p_user_id
  where invite_id = invitation.invite_id
    and used_at is null
    and used_by is null;
  if not found then raise exception using errcode = 'P0001', message = 'invite_used'; end if;

  return jsonb_build_object('family_id', invitation.family_id, 'invite_id', invitation.invite_id);
end;
$$;

revoke all on function public.accept_family_invite(text, text, text) from public;
revoke all on function public.accept_family_invite(text, text, text) from anon, authenticated;
grant execute on function public.accept_family_invite(text, text, text) to service_role;
