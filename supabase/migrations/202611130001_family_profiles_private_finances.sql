-- Add per-family user profiles and an isolated private ledger.
-- Existing shared rows are intentionally untouched and remain shared.

create table if not exists public.family_user_profiles (
  family_id text not null references public.families(family_id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  photo_path text,
  hide_google_photo boolean not null default false,
  relationship text not null default 'Outro'
    check (relationship in ('Pai','Mãe','Filho','Filha','Esposo','Esposa','Irmão','Irmã','Avô','Avó','Neto','Neta','Tio','Tia','Outro')),
  relationship_custom text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (family_id, user_id),
  check ((relationship = 'Outro') or relationship_custom is null),
  check (relationship_custom is null or char_length(btrim(relationship_custom)) between 1 and 60),
  foreign key (family_id, user_id) references public.family_memberships(family_id, user_id) on delete cascade
);

-- Add family-scoped display profiles for current members without changing the
-- account-level Google profile or touching any finance rows.
insert into public.family_user_profiles (family_id, user_id, display_name, relationship)
select fm.family_id, fm.user_id,
       left(coalesce(nullif(btrim(p.name), ''), split_part(p.email, '@', 1), 'Integrante'), 80),
       'Outro'
from public.family_memberships fm
join public.profiles p on p.user_id = fm.user_id
on conflict (family_id, user_id) do nothing;

create table if not exists public.personal_financial_items (
  item_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  owner_user_id text not null,
  kind text not null check (kind in ('income','fixed','variable')),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  icon text not null default 'tag',
  default_value numeric not null default 0 check (default_value >= 0),
  created_at timestamptz not null default now(),
  foreign key (family_id, owner_user_id) references public.family_memberships(family_id, user_id) on delete cascade,
  unique (item_id, family_id, owner_user_id)
);

create index if not exists personal_financial_items_owner_idx
  on public.personal_financial_items(family_id, owner_user_id, kind);

create table if not exists public.personal_financial_entries (
  family_id text not null,
  owner_user_id text not null,
  item_id text not null,
  year integer not null check (year between 2000 and 2200),
  month integer not null check (month between 1 and 12),
  value numeric not null check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (item_id, year, month),
  foreign key (family_id, owner_user_id) references public.family_memberships(family_id, user_id) on delete cascade,
  foreign key (item_id, family_id, owner_user_id)
    references public.personal_financial_items(item_id, family_id, owner_user_id) on delete cascade
);

create index if not exists personal_financial_entries_owner_period_idx
  on public.personal_financial_entries(family_id, owner_user_id, year, month);

-- Future correction workflow only: this table does not enable approval UI or actions.
create table if not exists public.shared_entry_correction_requests (
  request_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  requester_user_id text not null,
  entry_year integer not null,
  entry_month integer not null check (entry_month between 1 and 12),
  ref_type text not null check (ref_type in ('member','category')),
  ref_id text not null,
  requested_value numeric check (requested_value is null or requested_value >= 0),
  justification text not null check (char_length(btrim(justification)) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by text references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending' and reviewed_by is null and reviewed_at is null) or status <> 'pending')
);

-- Shared expenses created by an ordinary member are append-only for that member.
-- Manager approval/correction workflow remains future work.
create unique index if not exists categories_id_family_unique_idx on public.categories(category_id, family_id);
create table if not exists public.shared_expense_transactions (
  transaction_id text primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  created_by text not null,
  category_id text not null,
  year integer not null check (year between 2000 and 2200),
  month integer not null check (month between 1 and 12),
  amount numeric not null check (amount > 0),
  description text,
  created_at timestamptz not null default now(),
  foreign key (category_id, family_id) references public.categories(category_id, family_id) on delete restrict
);
create index if not exists shared_expense_transactions_family_period_idx
  on public.shared_expense_transactions(family_id, year, month, created_at desc);

create table if not exists public.family_admin_audit (
  audit_id bigint generated always as identity primary key,
  family_id text not null references public.families(family_id) on delete cascade,
  actor_user_id text not null,
  action text not null,
  target_user_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists family_admin_audit_family_created_idx
  on public.family_admin_audit(family_id, created_at desc);

-- The invitation's chosen name belongs to this family profile, never to the
-- Google account's global profile name.
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
  select * into invitation from public.family_invites where token_hash = p_token_hash for update;
  if not found then raise exception using errcode = 'P0001', message = 'invite_invalid'; end if;
  if invitation.cancelled_at is not null then raise exception using errcode = 'P0001', message = 'invite_cancelled'; end if;
  if invitation.used_at is not null then raise exception using errcode = 'P0001', message = 'invite_used'; end if;
  if invitation.expires_at <= now() then raise exception using errcode = 'P0001', message = 'invite_expired'; end if;

  select * into current_profile from public.profiles where user_id = p_user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'user_invalid'; end if;
  if exists (select 1 from public.family_memberships where user_id = p_user_id and family_id = invitation.family_id) then
    raise exception using errcode = 'P0001', message = 'user_already_member';
  end if;
  select count(*) into elevated_memberships from public.family_memberships where user_id = p_user_id and role in ('owner', 'admin');
  if elevated_memberships > 0 or current_profile.family_role in ('owner', 'admin') then
    raise exception using errcode = 'P0001', message = 'user_elevated_cannot_join';
  end if;

  next_name := left(coalesce(nullif(btrim(p_display_name), ''), current_profile.name, 'Integrante'), 80);
  insert into public.family_memberships (family_id, user_id, role) values (invitation.family_id, p_user_id, 'member');
  insert into public.family_user_profiles (family_id, user_id, display_name, relationship)
    values (invitation.family_id, p_user_id, next_name, 'Outro')
    on conflict (family_id, user_id) do update set display_name = excluded.display_name, updated_at = now();
  update public.profiles set family_id = invitation.family_id, family_role = 'member' where user_id = p_user_id;
  update public.family_invites set used_at = now(), used_by = p_user_id where invite_id = invitation.invite_id;
  return jsonb_build_object('family_id', invitation.family_id, 'invite_id', invitation.invite_id);
end;
$$;

revoke all on function public.accept_family_invite(text, text, text) from public;
grant execute on function public.accept_family_invite(text, text, text) to service_role;

-- Direct authenticated clients may change their own display name/photo only.
-- Relationship is set by a manager through the API; this trigger also blocks
-- bypassing that rule through direct Supabase table access.
create or replace function public.guard_family_profile_relationship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null and new.relationship <> 'Outro' and
     not exists (
       select 1 from public.family_memberships fm
       where fm.family_id = new.family_id and fm.user_id = auth.uid()::text and fm.role in ('owner','admin')
     ) then
    raise exception 'Only a family owner or administrator can set relationship';
  end if;
  if auth.uid() is not null and new.photo_path is not null and
     (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path) and
     not (new.photo_path like (new.family_id || '/profiles/' || new.user_id || '/%')) then
    raise exception 'Profile photo path must be owned by the profile user';
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and
     (new.relationship is distinct from old.relationship or new.relationship_custom is distinct from old.relationship_custom) and
     not exists (
       select 1 from public.family_memberships fm
       where fm.family_id = old.family_id and fm.user_id = auth.uid()::text and fm.role in ('owner','admin')
     ) then
    raise exception 'Only a family owner or administrator can change relationship';
  end if;
  return new;
end;
$$;
drop trigger if exists family_profile_relationship_guard on public.family_user_profiles;
create trigger family_profile_relationship_guard before insert or update on public.family_user_profiles
for each row execute function public.guard_family_profile_relationship();

alter table public.family_user_profiles enable row level security;
alter table public.personal_financial_items enable row level security;
alter table public.personal_financial_entries enable row level security;
alter table public.shared_entry_correction_requests enable row level security;
alter table public.shared_expense_transactions enable row level security;
alter table public.family_admin_audit enable row level security;

drop policy if exists family_user_profiles_select_member on public.family_user_profiles;
create policy family_user_profiles_select_member on public.family_user_profiles
  for select to authenticated using (exists (
    select 1 from public.family_memberships fm
    where fm.family_id = family_user_profiles.family_id and fm.user_id = auth.uid()::text
  ));
drop policy if exists family_user_profiles_insert_self on public.family_user_profiles;
create policy family_user_profiles_insert_self on public.family_user_profiles
  for insert to authenticated with check (user_id = auth.uid()::text and exists (
    select 1 from public.family_memberships fm
    where fm.family_id = family_user_profiles.family_id and fm.user_id = auth.uid()::text
  ));
drop policy if exists family_user_profiles_update_self_or_manager on public.family_user_profiles;
drop policy if exists family_user_profiles_update_self on public.family_user_profiles;
create policy family_user_profiles_update_self on public.family_user_profiles
  for update to authenticated using (user_id = auth.uid()::text and exists (
    select 1 from public.family_memberships actor
    where actor.family_id = family_user_profiles.family_id and actor.user_id = auth.uid()::text
  )) with check (user_id = auth.uid()::text and exists (
    select 1 from public.family_memberships actor
    where actor.family_id = family_user_profiles.family_id and actor.user_id = auth.uid()::text
  ));

drop policy if exists personal_items_owner_only on public.personal_financial_items;
create policy personal_items_owner_only on public.personal_financial_items
  for all to authenticated using (owner_user_id = auth.uid()::text and exists (
    select 1 from public.family_memberships fm where fm.family_id = personal_financial_items.family_id and fm.user_id = auth.uid()::text
  )) with check (owner_user_id = auth.uid()::text and exists (
    select 1 from public.family_memberships fm where fm.family_id = personal_financial_items.family_id and fm.user_id = auth.uid()::text
  ));

drop policy if exists personal_entries_owner_only on public.personal_financial_entries;
create policy personal_entries_owner_only on public.personal_financial_entries
  for all to authenticated using (owner_user_id = auth.uid()::text and exists (
    select 1 from public.family_memberships fm where fm.family_id = personal_financial_entries.family_id and fm.user_id = auth.uid()::text
  )) with check (owner_user_id = auth.uid()::text and exists (
    select 1 from public.family_memberships fm where fm.family_id = personal_financial_entries.family_id and fm.user_id = auth.uid()::text
  ));

drop policy if exists correction_requests_member_scope on public.shared_entry_correction_requests;
create policy correction_requests_member_scope on public.shared_entry_correction_requests
  for select to authenticated using (requester_user_id = auth.uid()::text or exists (
    select 1 from public.family_memberships fm where fm.family_id = shared_entry_correction_requests.family_id
      and fm.user_id = auth.uid()::text and fm.role in ('owner','admin')
  ));

drop policy if exists shared_expenses_family_select on public.shared_expense_transactions;
create policy shared_expenses_family_select on public.shared_expense_transactions
  for select to authenticated using (exists (
    select 1 from public.family_memberships fm where fm.family_id = shared_expense_transactions.family_id
      and fm.user_id = auth.uid()::text
  ));
drop policy if exists shared_expenses_member_insert on public.shared_expense_transactions;
create policy shared_expenses_member_insert on public.shared_expense_transactions
  for insert to authenticated with check (created_by = auth.uid()::text and exists (
    select 1 from public.family_memberships fm where fm.family_id = shared_expense_transactions.family_id
      and fm.user_id = auth.uid()::text
  ) and exists (
    select 1 from public.categories c where c.category_id = shared_expense_transactions.category_id
      and c.family_id = shared_expense_transactions.family_id and c.kind in ('fixed','variable')
  ));
drop policy if exists correction_requests_insert_self on public.shared_entry_correction_requests;
create policy correction_requests_insert_self on public.shared_entry_correction_requests
  for insert to authenticated with check (requester_user_id = auth.uid()::text and status = 'pending'
    and reviewed_by is null and reviewed_at is null and exists (
      select 1 from public.family_memberships fm where fm.family_id = shared_entry_correction_requests.family_id
        and fm.user_id = auth.uid()::text
    ));
drop policy if exists family_admin_audit_manager_read on public.family_admin_audit;
create policy family_admin_audit_manager_read on public.family_admin_audit
  for select to authenticated using (exists (
    select 1 from public.family_memberships fm where fm.family_id = family_admin_audit.family_id
      and fm.user_id = auth.uid()::text and fm.role in ('owner','admin')
  ));

grant select, insert on public.family_user_profiles to authenticated;
grant update (display_name, photo_path, hide_google_photo) on public.family_user_profiles to authenticated;
grant select, insert, delete on public.personal_financial_items to authenticated;
grant update (kind, name, icon, default_value) on public.personal_financial_items to authenticated;
grant select, insert, delete on public.personal_financial_entries to authenticated;
grant update (value, updated_at) on public.personal_financial_entries to authenticated;
grant select, insert on public.shared_entry_correction_requests to authenticated;
grant select, insert on public.shared_expense_transactions to authenticated;
grant select on public.family_admin_audit to authenticated;
grant all on public.family_user_profiles, public.personal_financial_items, public.personal_financial_entries,
  public.shared_entry_correction_requests, public.family_admin_audit to service_role;
grant all on public.shared_expense_transactions to service_role;
