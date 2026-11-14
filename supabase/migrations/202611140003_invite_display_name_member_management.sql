-- Family-scoped app display names and manager-only family-person maintenance.
-- Additive: preserves all existing profiles, memberships, finance people,
-- entries, invitations and storage objects.

alter table public.profiles
  add column if not exists google_name text;

update public.profiles
set google_name = name
where google_name is null;

alter table public.family_memberships
  add column if not exists display_name text;

update public.family_memberships fm
set display_name = p.name
from public.profiles p
where p.user_id = fm.user_id
  and fm.display_name is null
  and nullif(btrim(p.name), '') is not null;

-- Family members may read budget people, but only an owner/admin may write.
drop policy if exists members_by_family on public.members;
drop policy if exists members_select_by_family on public.members;
drop policy if exists members_insert_by_manager on public.members;
drop policy if exists members_update_by_manager on public.members;
drop policy if exists members_delete_by_manager on public.members;

create policy members_select_by_family on public.members
  for select to authenticated
  using (family_id = public.current_family_id());

create policy members_insert_by_manager on public.members
  for insert to authenticated
  with check (
    family_id = public.current_family_id()
    and exists (
      select 1 from public.family_memberships fm
      where fm.family_id = members.family_id
        and fm.user_id = auth.uid()::text
        and fm.role in ('owner', 'admin')
    )
  );

create policy members_update_by_manager on public.members
  for update to authenticated
  using (
    family_id = public.current_family_id()
    and exists (
      select 1 from public.family_memberships fm
      where fm.family_id = members.family_id
        and fm.user_id = auth.uid()::text
        and fm.role in ('owner', 'admin')
    )
  )
  with check (
    family_id = public.current_family_id()
    and exists (
      select 1 from public.family_memberships fm
      where fm.family_id = members.family_id
        and fm.user_id = auth.uid()::text
        and fm.role in ('owner', 'admin')
    )
  );

create policy members_delete_by_manager on public.members
  for delete to authenticated
  using (
    family_id = public.current_family_id()
    and exists (
      select 1 from public.family_memberships fm
      where fm.family_id = members.family_id
        and fm.user_id = auth.uid()::text
        and fm.role in ('owner', 'admin')
    )
  );

-- Account/category configuration is also a family-management operation.
drop policy if exists categories_by_family on public.categories;
drop policy if exists categories_select_by_family on public.categories;
drop policy if exists categories_insert_by_manager on public.categories;
drop policy if exists categories_update_by_manager on public.categories;
drop policy if exists categories_delete_by_manager on public.categories;

create policy categories_select_by_family on public.categories
  for select to authenticated
  using (family_id = public.current_family_id());

create policy categories_insert_by_manager on public.categories
  for insert to authenticated
  with check (
    family_id = public.current_family_id()
    and exists (
      select 1 from public.family_memberships fm
      where fm.family_id = categories.family_id
        and fm.user_id = auth.uid()::text
        and fm.role in ('owner', 'admin')
    )
  );

create policy categories_update_by_manager on public.categories
  for update to authenticated
  using (
    family_id = public.current_family_id()
    and exists (
      select 1 from public.family_memberships fm
      where fm.family_id = categories.family_id
        and fm.user_id = auth.uid()::text
        and fm.role in ('owner', 'admin')
    )
  )
  with check (
    family_id = public.current_family_id()
    and exists (
      select 1 from public.family_memberships fm
      where fm.family_id = categories.family_id
        and fm.user_id = auth.uid()::text
        and fm.role in ('owner', 'admin')
    )
  );

create policy categories_delete_by_manager on public.categories
  for delete to authenticated
  using (
    family_id = public.current_family_id()
    and exists (
      select 1 from public.family_memberships fm
      where fm.family_id = categories.family_id
        and fm.user_id = auth.uid()::text
        and fm.role in ('owner', 'admin')
    )
  );

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
  insert into public.family_memberships (family_id, user_id, role, display_name)
  values (invitation.family_id, p_user_id, 'member', coalesce(next_name, nullif(btrim(current_profile.name), '')));

  -- Keep the app-selected name scoped to this family. Never replace the
  -- account's Google identity or global profile name during invite acceptance.
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

comment on column public.profiles.google_name is
  'Provider name retained for account identity; not a family display-name source after profile creation.';
comment on column public.family_memberships.display_name is
  'User-selected name shown in this family; independent from the Google account name.';
