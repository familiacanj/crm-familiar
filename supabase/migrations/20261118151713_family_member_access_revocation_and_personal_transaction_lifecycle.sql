-- Logical family access revocation and owner-only personal transaction lifecycle.
-- Keep membership rows because related financial and audit tables use ON DELETE CASCADE.
alter table public.family_memberships
  add column if not exists is_active boolean not null default true,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by_user_id text;
create index if not exists family_memberships_active_user_family_idx
  on public.family_memberships (user_id, family_id) where is_active;

create table if not exists public.family_membership_access_audit (
  audit_id uuid primary key default gen_random_uuid(),
  family_id text not null,
  target_user_id text not null,
  actor_user_id text not null,
  action text not null check (action in ('removed', 'left', 'rejoined')),
  created_at timestamptz not null default now()
);
create index if not exists family_membership_access_audit_family_created_idx
  on public.family_membership_access_audit (family_id, created_at desc);
alter table public.family_membership_access_audit enable row level security;
revoke all on public.family_membership_access_audit from public, anon, authenticated;
grant all on public.family_membership_access_audit to service_role;

alter table public.personal_expense_transactions
  add column if not exists updated_at timestamptz,
  add column if not exists deleted_at timestamptz;
alter table public.personal_income_transactions
  add column if not exists updated_at timestamptz,
  add column if not exists deleted_at timestamptz;
create table if not exists public.personal_financial_transaction_audit (
  audit_id uuid primary key default gen_random_uuid(),
  family_id text not null,
  owner_user_id text not null,
  transaction_id text not null,
  transaction_kind text not null check (transaction_kind in ('income', 'expense')),
  action text not null check (action in ('updated', 'deleted')),
  created_at timestamptz not null default now()
);
create index if not exists personal_financial_transaction_audit_owner_idx
  on public.personal_financial_transaction_audit (owner_user_id, created_at desc);
alter table public.personal_financial_transaction_audit enable row level security;
revoke all on public.personal_financial_transaction_audit from public, anon, authenticated;
grant all on public.personal_financial_transaction_audit to service_role;

create or replace function public.current_family_id()
returns text language sql stable set search_path = public
as $function$
  select p.family_id
  from public.profiles p
  join public.family_memberships fm
    on fm.family_id=p.family_id and fm.user_id=p.user_id and fm.is_active
  where p.user_id=(select auth.uid())::text
  limit 1;
$function$;
revoke execute on function public.current_family_id() from public, anon;
grant execute on function public.current_family_id() to authenticated, service_role;

create or replace function public.accept_family_invite(
  p_token_hash text, p_user_id text, p_display_name text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  invitation public.family_invites%rowtype;
  current_profile public.profiles%rowtype;
  next_name text;
  elevated_memberships integer;
  existing_active boolean;
begin
  select * into invitation from public.family_invites where token_hash=p_token_hash for update;
  if not found then raise exception using errcode='P0001',message='invite_invalid'; end if;
  if invitation.cancelled_at is not null then raise exception using errcode='P0001',message='invite_cancelled'; end if;
  if invitation.used_at is not null or invitation.used_by is not null then raise exception using errcode='P0001',message='invite_used'; end if;
  if invitation.expires_at<=now() then raise exception using errcode='P0001',message='invite_expired'; end if;
  select * into current_profile from public.profiles where user_id=p_user_id for update;
  if not found then raise exception using errcode='P0001',message='user_invalid'; end if;

  select coalesce(bool_or(is_active),false) into existing_active
    from public.family_memberships where user_id=p_user_id and family_id=invitation.family_id;
  if existing_active then raise exception using errcode='P0001',message='user_already_member'; end if;
  select count(*) into elevated_memberships from public.family_memberships
    where user_id=p_user_id and is_active and role in ('owner','admin');
  if elevated_memberships>0 or current_profile.family_role in ('owner','admin') then
    raise exception using errcode='P0001',message='user_elevated_cannot_join';
  end if;

  next_name:=nullif(left(btrim(coalesce(p_display_name,'')),80),'');
  insert into public.family_memberships (
    family_id,user_id,role,display_name,profile_completion_required,
    is_active,revoked_at,revoked_by_user_id,joined_at
  ) values (
    invitation.family_id,p_user_id,'member',
    coalesce(next_name,nullif(btrim(current_profile.name),'')),true,
    true,null,null,now()
  )
  on conflict (family_id,user_id) do update set
    role='member',is_active=true,revoked_at=null,revoked_by_user_id=null,joined_at=now(),
    display_name=coalesce(excluded.display_name,public.family_memberships.display_name),
    profile_completion_required=true;

  update public.profiles set family_id=invitation.family_id,family_role='member'
    where user_id=p_user_id;
  insert into public.family_membership_access_audit(family_id,target_user_id,actor_user_id,action)
    values(invitation.family_id,p_user_id,p_user_id,'rejoined');
  update public.family_invites set used_at=now(),used_by=p_user_id
    where invite_id=invitation.invite_id and used_at is null and used_by is null;
  if not found then raise exception using errcode='P0001',message='invite_used'; end if;
  return jsonb_build_object('family_id',invitation.family_id,'invite_id',invitation.invite_id);
end;
$function$;
revoke execute on function public.accept_family_invite(text,text,text) from public,anon,authenticated;
grant execute on function public.accept_family_invite(text,text,text) to service_role;

create or replace function public.set_family_member_role(
  p_family_id text,p_actor_user_id text,p_target_user_id text,p_role text
)
returns void language plpgsql security definer set search_path = ''
as $function$
declare actor_role text;
begin
  if p_role not in ('admin','member') then raise exception using errcode='P0001',message='role_invalid'; end if;
  select role into actor_role from public.family_memberships
    where family_id=p_family_id and user_id=p_actor_user_id and is_active for update;
  if coalesce(actor_role,'')<>'owner' then raise exception using errcode='P0001',message='role_owner_required'; end if;
  if not exists(select 1 from public.family_memberships where family_id=p_family_id and user_id=p_target_user_id and is_active) then
    raise exception using errcode='P0001',message='target_not_member';
  end if;
  if exists(select 1 from public.family_memberships where family_id=p_family_id and user_id=p_target_user_id and role='owner' and is_active) then
    raise exception using errcode='P0001',message='owner_role_immutable';
  end if;
  if p_role='admin' and (select count(*) from public.family_memberships where user_id=p_target_user_id and is_active)>1 then
    raise exception using errcode='P0001',message='multi_family_admin_forbidden';
  end if;
  update public.family_memberships set role=p_role where family_id=p_family_id and user_id=p_target_user_id and is_active;
  update public.profiles set family_role=p_role where user_id=p_target_user_id and family_id=p_family_id;
end;
$function$;
revoke execute on function public.set_family_member_role(text,text,text,text) from public,anon,authenticated;
grant execute on function public.set_family_member_role(text,text,text,text) to service_role;

create or replace function public.revoke_family_member_access(
  p_family_id text,p_actor_user_id text,p_target_user_id text
)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  actor_role text;
  target_role text;
  next_family_id text;
  next_role text;
  event_action text;
begin
  select role into actor_role from public.family_memberships
    where family_id=p_family_id and user_id=p_actor_user_id and is_active for update;
  if actor_role is null then raise exception using errcode='P0001',message='family_access_actor_not_active'; end if;
  select role into target_role from public.family_memberships
    where family_id=p_family_id and user_id=p_target_user_id and is_active for update;
  if target_role is null then raise exception using errcode='P0001',message='family_access_target_not_active'; end if;
  if target_role='owner' then raise exception using errcode='P0001',message='family_access_owner_immutable'; end if;
  if actor_role not in ('owner','admin') and p_actor_user_id<>p_target_user_id then
    raise exception using errcode='P0001',message='family_access_actor_forbidden';
  end if;
  if actor_role='admin' and target_role<>'member' and p_actor_user_id<>p_target_user_id then
    raise exception using errcode='P0001',message='family_access_actor_forbidden';
  end if;

  update public.family_memberships set is_active=false,revoked_at=now(),revoked_by_user_id=p_actor_user_id
    where family_id=p_family_id and user_id=p_target_user_id and is_active;
  if not found then raise exception using errcode='P0001',message='family_access_target_not_active'; end if;
  event_action:=case when p_actor_user_id=p_target_user_id then 'left' else 'removed' end;
  insert into public.family_membership_access_audit(family_id,target_user_id,actor_user_id,action)
    values(p_family_id,p_target_user_id,p_actor_user_id,event_action);

  select family_id,role into next_family_id,next_role from public.family_memberships
    where user_id=p_target_user_id and is_active order by joined_at desc limit 1;
  if next_family_id is not null then
    update public.profiles set family_id=next_family_id,family_role=next_role where user_id=p_target_user_id;
  else
    -- Keep the prior family id only as the owner's private-finance scope.
    -- Backend and RLS family endpoints require an active membership.
    update public.profiles set family_role='member'
      where user_id=p_target_user_id and family_id=p_family_id;
  end if;
end;
$function$;
revoke execute on function public.revoke_family_member_access(text,text,text) from public,anon,authenticated;
grant execute on function public.revoke_family_member_access(text,text,text) to service_role;

create or replace function public.update_personal_income_transaction(
  p_family_id text,p_owner_user_id text,p_transaction_id text,
  p_amount numeric,p_occurred_on date,p_description text,p_category_id text
)
returns table(transaction_id text,updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $function$
declare v_row public.personal_income_transactions%rowtype;
begin
  select * into v_row from public.personal_income_transactions t
    where t.family_id=p_family_id and t.owner_user_id=p_owner_user_id and t.transaction_id=p_transaction_id and t.deleted_at is null for update;
  if not found then raise exception using errcode='P0001',message='personal_income_not_found'; end if;
  if p_amount is null or p_amount<=0 or p_occurred_on is null
    or char_length(btrim(coalesce(p_description,''))) not between 1 and 240 then
    raise exception using errcode='P0001',message='personal_income_invalid';
  end if;
  if p_category_id is not null and not exists(select 1 from public.categories c where c.family_id=p_family_id and c.category_id=p_category_id) then
    raise exception using errcode='P0001',message='personal_income_category_invalid';
  end if;
  update public.personal_income_transactions t set amount=round(p_amount,2),occurred_on=p_occurred_on,
    description=btrim(p_description),category_id=p_category_id,updated_at=now()
    where t.transaction_id=p_transaction_id returning * into v_row;
  insert into public.personal_financial_transaction_audit(family_id,owner_user_id,transaction_id,transaction_kind,action)
    values(p_family_id,p_owner_user_id,p_transaction_id,'income','updated');
  return query select v_row.transaction_id,v_row.updated_at;
end;
$function$;

create or replace function public.soft_delete_personal_income_transaction(
  p_family_id text,p_owner_user_id text,p_transaction_id text
)
returns table(transaction_id text,deleted boolean)
language plpgsql security definer set search_path = ''
as $function$
declare v_row public.personal_income_transactions%rowtype;
begin
  select * into v_row from public.personal_income_transactions t
    where t.family_id=p_family_id and t.owner_user_id=p_owner_user_id and t.transaction_id=p_transaction_id for update;
  if not found then raise exception using errcode='P0001',message='personal_income_not_found'; end if;
  if v_row.deleted_at is null then
    update public.personal_income_transactions t set deleted_at=now(),updated_at=now() where t.transaction_id=p_transaction_id;
    insert into public.personal_financial_transaction_audit(family_id,owner_user_id,transaction_id,transaction_kind,action)
      values(p_family_id,p_owner_user_id,p_transaction_id,'income','deleted');
  end if;
  return query select p_transaction_id,true;
end;
$function$;

create or replace function public.update_personal_expense_transaction(
  p_family_id text,p_owner_user_id text,p_transaction_id text,
  p_total_amount numeric,p_occurred_on date,p_description text,p_category_id text
)
returns table(transaction_id text,updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $function$
declare v_row public.personal_expense_transactions%rowtype;
begin
  select * into v_row from public.personal_expense_transactions t
    where t.family_id=p_family_id and t.owner_user_id=p_owner_user_id and t.transaction_id=p_transaction_id and t.deleted_at is null for update;
  if not found then raise exception using errcode='P0001',message='personal_expense_not_found'; end if;
  if v_row.family_amount>0 or exists(select 1 from public.family_financial_movements m where m.source_personal_expense_id=p_transaction_id) then
    raise exception using errcode='P0001',message='personal_expense_family_linked';
  end if;
  if p_total_amount is null or p_total_amount<=0 or p_occurred_on is null
    or char_length(btrim(coalesce(p_description,''))) not between 1 and 240 then
    raise exception using errcode='P0001',message='personal_expense_invalid';
  end if;
  if p_category_id is not null and not exists(select 1 from public.categories c where c.family_id=p_family_id and c.category_id=p_category_id) then
    raise exception using errcode='P0001',message='personal_expense_category_invalid';
  end if;
  update public.personal_expense_transactions t set total_amount=round(p_total_amount,2),
    personal_amount=round(p_total_amount,2),family_amount=0,scope='personal',
    occurred_on=p_occurred_on,description=btrim(p_description),category_id=p_category_id,updated_at=now()
    where t.transaction_id=p_transaction_id returning * into v_row;
  insert into public.personal_financial_transaction_audit(family_id,owner_user_id,transaction_id,transaction_kind,action)
    values(p_family_id,p_owner_user_id,p_transaction_id,'expense','updated');
  return query select v_row.transaction_id,v_row.updated_at;
end;
$function$;

create or replace function public.soft_delete_personal_expense_transaction(
  p_family_id text,p_owner_user_id text,p_transaction_id text
)
returns table(transaction_id text,deleted boolean)
language plpgsql security definer set search_path = ''
as $function$
declare v_row public.personal_expense_transactions%rowtype;
begin
  select * into v_row from public.personal_expense_transactions t
    where t.family_id=p_family_id and t.owner_user_id=p_owner_user_id and t.transaction_id=p_transaction_id for update;
  if not found then raise exception using errcode='P0001',message='personal_expense_not_found'; end if;
  if v_row.deleted_at is null then
    if v_row.family_amount>0 or exists(select 1 from public.family_financial_movements m where m.source_personal_expense_id=p_transaction_id) then
      raise exception using errcode='P0001',message='personal_expense_family_linked';
    end if;
    update public.personal_expense_transactions t set deleted_at=now(),updated_at=now() where t.transaction_id=p_transaction_id;
    insert into public.personal_financial_transaction_audit(family_id,owner_user_id,transaction_id,transaction_kind,action)
      values(p_family_id,p_owner_user_id,p_transaction_id,'expense','deleted');
  end if;
  return query select p_transaction_id,true;
end;
$function$;

revoke execute on function public.update_personal_income_transaction(text,text,text,numeric,date,text,text) from public,anon,authenticated;
revoke execute on function public.soft_delete_personal_income_transaction(text,text,text) from public,anon,authenticated;
revoke execute on function public.update_personal_expense_transaction(text,text,text,numeric,date,text,text) from public,anon,authenticated;
revoke execute on function public.soft_delete_personal_expense_transaction(text,text,text) from public,anon,authenticated;
grant execute on function public.update_personal_income_transaction(text,text,text,numeric,date,text,text) to service_role;
grant execute on function public.soft_delete_personal_income_transaction(text,text,text) to service_role;
grant execute on function public.update_personal_expense_transaction(text,text,text,numeric,date,text,text) to service_role;
grant execute on function public.soft_delete_personal_expense_transaction(text,text,text) to service_role;

-- Replace the family context helper and require active membership in shared RLS.
drop policy if exists bill_payments_by_family on public.bill_payments;
create policy bill_payments_by_family on public.bill_payments for all to authenticated using(family_id=public.current_family_id()) with check(family_id=public.current_family_id());
drop policy if exists entries_by_family on public.entries;
create policy entries_by_family on public.entries for all to authenticated using(family_id=public.current_family_id()) with check(family_id=public.current_family_id());
drop policy if exists families_by_membership on public.families;
create policy families_by_membership on public.families for all to authenticated using(family_id=public.current_family_id()) with check(family_id=public.current_family_id());
drop policy if exists goals_by_family on public.goals;
create policy goals_by_family on public.goals for all to authenticated using(family_id=public.current_family_id()) with check(family_id=public.current_family_id());
drop policy if exists goal_deposits_by_family on public.goal_deposits;
create policy goal_deposits_by_family on public.goal_deposits for all to authenticated
  using(exists(select 1 from public.goals g where g.goal_id=goal_deposits.goal_id and g.family_id=public.current_family_id()))
  with check(exists(select 1 from public.goals g where g.goal_id=goal_deposits.goal_id and g.family_id=public.current_family_id()));
drop policy if exists categories_select_by_family on public.categories;
create policy categories_select_by_family on public.categories for select to authenticated using(family_id=public.current_family_id());
drop policy if exists members_select_by_family on public.members;
create policy members_select_by_family on public.members for select to authenticated using(family_id=public.current_family_id());

drop policy if exists categories_insert_by_manager on public.categories;
create policy categories_insert_by_manager on public.categories for insert to authenticated with check(
  family_id=public.current_family_id() and exists(select 1 from public.family_memberships fm where fm.family_id=categories.family_id and fm.user_id=(select auth.uid())::text and fm.is_active and fm.role in ('owner','admin')));
drop policy if exists categories_update_by_manager on public.categories;
create policy categories_update_by_manager on public.categories for update to authenticated
  using(family_id=public.current_family_id() and exists(select 1 from public.family_memberships fm where fm.family_id=categories.family_id and fm.user_id=(select auth.uid())::text and fm.is_active and fm.role in ('owner','admin')))
  with check(family_id=public.current_family_id() and exists(select 1 from public.family_memberships fm where fm.family_id=categories.family_id and fm.user_id=(select auth.uid())::text and fm.is_active and fm.role in ('owner','admin')));
drop policy if exists categories_delete_by_manager on public.categories;
create policy categories_delete_by_manager on public.categories for delete to authenticated using(
  family_id=public.current_family_id() and exists(select 1 from public.family_memberships fm where fm.family_id=categories.family_id and fm.user_id=(select auth.uid())::text and fm.is_active and fm.role in ('owner','admin')));
drop policy if exists members_insert_by_manager on public.members;
create policy members_insert_by_manager on public.members for insert to authenticated with check(
  family_id=public.current_family_id() and exists(select 1 from public.family_memberships fm where fm.family_id=members.family_id and fm.user_id=(select auth.uid())::text and fm.is_active and fm.role in ('owner','admin')));
drop policy if exists members_update_by_manager on public.members;
create policy members_update_by_manager on public.members for update to authenticated
  using(family_id=public.current_family_id() and exists(select 1 from public.family_memberships fm where fm.family_id=members.family_id and fm.user_id=(select auth.uid())::text and fm.is_active and fm.role in ('owner','admin')))
  with check(family_id=public.current_family_id() and exists(select 1 from public.family_memberships fm where fm.family_id=members.family_id and fm.user_id=(select auth.uid())::text and fm.is_active and fm.role in ('owner','admin')));
drop policy if exists members_delete_by_manager on public.members;
create policy members_delete_by_manager on public.members for delete to authenticated using(
  family_id=public.current_family_id() and exists(select 1 from public.family_memberships fm where fm.family_id=members.family_id and fm.user_id=(select auth.uid())::text and fm.is_active and fm.role in ('owner','admin')));

drop policy if exists family_contribution_rules_owner_only on public.family_contribution_rules;
create policy family_contribution_rules_owner_only on public.family_contribution_rules for all to authenticated
  using(owner_user_id=(select auth.uid())::text and exists(select 1 from public.family_memberships fm where fm.family_id=family_contribution_rules.family_id and fm.user_id=(select auth.uid())::text and fm.is_active))
  with check(owner_user_id=(select auth.uid())::text and exists(select 1 from public.family_memberships fm where fm.family_id=family_contribution_rules.family_id and fm.user_id=(select auth.uid())::text and fm.is_active));
drop policy if exists family_financial_movements_member_read on public.family_financial_movements;
create policy family_financial_movements_member_read on public.family_financial_movements for select to authenticated using(
  exists(select 1 from public.family_memberships fm where fm.family_id=family_financial_movements.family_id and fm.user_id=(select auth.uid())::text and fm.is_active));
drop policy if exists family_monthly_commitments_member_read on public.family_monthly_commitments;
create policy family_monthly_commitments_member_read on public.family_monthly_commitments for select to authenticated using(
  exists(select 1 from public.family_memberships fm where fm.family_id=family_monthly_commitments.family_id and fm.user_id=(select auth.uid())::text and fm.is_active));
drop policy if exists family_minor_guardians_guardian_read on public.family_minor_guardians;
create policy family_minor_guardians_guardian_read on public.family_minor_guardians for select to authenticated using(
  guardian_user_id=(select auth.uid())::text and exists(select 1 from public.family_memberships fm where fm.family_id=family_minor_guardians.family_id and fm.user_id=(select auth.uid())::text and fm.is_active));
drop policy if exists family_reimbursements_requester_or_manager on public.family_reimbursements;
create policy family_reimbursements_requester_or_manager on public.family_reimbursements for select to authenticated using(
  exists(select 1 from public.family_memberships fm where fm.family_id=family_reimbursements.family_id and fm.user_id=(select auth.uid())::text and fm.is_active)
  and (requested_by_user_id=(select auth.uid())::text or exists(select 1 from public.family_memberships fm where fm.family_id=family_reimbursements.family_id and fm.user_id=(select auth.uid())::text and fm.is_active and fm.role in ('owner','admin'))));
drop policy if exists family_reimbursement_payments_requester_or_manager on public.family_reimbursement_payments;
create policy family_reimbursement_payments_requester_or_manager on public.family_reimbursement_payments for select to authenticated using(
  exists(select 1 from public.family_reimbursements r where r.reimbursement_id=family_reimbursement_payments.reimbursement_id
    and exists(select 1 from public.family_memberships fm where fm.family_id=r.family_id and fm.user_id=(select auth.uid())::text and fm.is_active)
    and (r.requested_by_user_id=(select auth.uid())::text or exists(select 1 from public.family_memberships fm where fm.family_id=r.family_id and fm.user_id=(select auth.uid())::text and fm.is_active and fm.role in ('owner','admin')))));

-- Retain owner visibility for the owner's transactions, including after removal,
-- but hide soft-deleted rows and require active guardian/minor memberships.
drop policy if exists personal_expense_transactions_owner_only on public.personal_expense_transactions;
create policy personal_expense_transactions_owner_only on public.personal_expense_transactions for select to authenticated using(owner_user_id=(select auth.uid())::text and deleted_at is null);
drop policy if exists personal_income_transactions_owner_only on public.personal_income_transactions;
create policy personal_income_transactions_owner_only on public.personal_income_transactions for select to authenticated using(owner_user_id=(select auth.uid())::text and deleted_at is null);
drop policy if exists personal_expense_transactions_minor_guardian_read on public.personal_expense_transactions;
create policy personal_expense_transactions_minor_guardian_read on public.personal_expense_transactions for select to authenticated using(
  exists(select 1 from public.family_minor_guardians g
    join public.family_memberships guardian on guardian.family_id=g.family_id and guardian.user_id=g.guardian_user_id and guardian.is_active
    join public.family_memberships minor on minor.family_id=g.family_id and minor.user_id=g.minor_user_id and minor.is_active
    where g.family_id=personal_expense_transactions.family_id and g.minor_user_id=personal_expense_transactions.owner_user_id
      and g.guardian_user_id=(select auth.uid())::text and personal_expense_transactions.deleted_at is null
      and current_date<(g.minor_birth_date+interval '18 years')::date));
drop policy if exists personal_income_transactions_minor_guardian_read on public.personal_income_transactions;
create policy personal_income_transactions_minor_guardian_read on public.personal_income_transactions for select to authenticated using(
  exists(select 1 from public.family_minor_guardians g
    join public.family_memberships guardian on guardian.family_id=g.family_id and guardian.user_id=g.guardian_user_id and guardian.is_active
    join public.family_memberships minor on minor.family_id=g.family_id and minor.user_id=g.minor_user_id and minor.is_active
    where g.family_id=personal_income_transactions.family_id and g.minor_user_id=personal_income_transactions.owner_user_id
      and g.guardian_user_id=(select auth.uid())::text and personal_income_transactions.deleted_at is null
      and current_date<(g.minor_birth_date+interval '18 years')::date));
drop policy if exists personal_financial_items_minor_guardian_read on public.personal_financial_items;
create policy personal_financial_items_minor_guardian_read on public.personal_financial_items for select to authenticated using(
  exists(select 1 from public.family_minor_guardians g
    join public.family_memberships guardian on guardian.family_id=g.family_id and guardian.user_id=g.guardian_user_id and guardian.is_active
    join public.family_memberships minor on minor.family_id=g.family_id and minor.user_id=g.minor_user_id and minor.is_active
    where g.family_id=personal_financial_items.family_id and g.minor_user_id=personal_financial_items.owner_user_id
      and g.guardian_user_id=(select auth.uid())::text and current_date<(g.minor_birth_date+interval '18 years')::date));
drop policy if exists personal_financial_entries_minor_guardian_read on public.personal_financial_entries;
create policy personal_financial_entries_minor_guardian_read on public.personal_financial_entries for select to authenticated using(
  exists(select 1 from public.family_minor_guardians g
    join public.family_memberships guardian on guardian.family_id=g.family_id and guardian.user_id=g.guardian_user_id and guardian.is_active
    join public.family_memberships minor on minor.family_id=g.family_id and minor.user_id=g.minor_user_id and minor.is_active
    where g.family_id=personal_financial_entries.family_id and g.minor_user_id=personal_financial_entries.owner_user_id
      and g.guardian_user_id=(select auth.uid())::text and current_date<(g.minor_birth_date+interval '18 years')::date));

drop policy if exists personal_family_transfers_owner_only on public.personal_family_transfers;
create policy personal_family_transfers_owner_only on public.personal_family_transfers for select to authenticated using(
  owner_user_id=(select auth.uid())::text and exists(select 1 from public.family_memberships fm where fm.family_id=personal_family_transfers.family_id and fm.user_id=(select auth.uid())::text and fm.is_active));

-- A former member may continue to post personal-only spending, but cannot
-- create new expenses that change the shared family ledger.
create or replace function public.record_personal_expense_transaction_v2(
  p_family_id text,p_owner_user_id text,p_scope text,p_description text,p_occurred_on date,
  p_total_amount numeric,p_personal_amount numeric,p_family_amount numeric,p_category_id text,p_idempotency_key text
)
returns table(transaction_id text,family_id text,owner_user_id text,scope text,description text,
  occurred_on date,total_amount numeric,personal_amount numeric,family_amount numeric,family_movement_id text,idempotent boolean)
language plpgsql set search_path=''
as $function$
declare v_result record; v_existing_category text;
begin
  if p_scope<>'personal' and not exists(select 1 from public.family_memberships fm
    where fm.family_id=p_family_id and fm.user_id=p_owner_user_id and fm.is_active) then
    raise exception using errcode='P0001',message='personal_expense_family_access_revoked';
  end if;
  if p_category_id is not null and not exists(select 1 from public.categories c
    where c.family_id=p_family_id and c.category_id=p_category_id) then
    raise exception using errcode='P0001',message='expense_category_invalid';
  end if;
  select * into v_result from public.record_personal_expense_transaction(
    p_family_id,p_owner_user_id,p_scope,p_description,p_occurred_on,
    p_total_amount,p_personal_amount,p_family_amount,p_idempotency_key
  );
  select t.category_id into v_existing_category from public.personal_expense_transactions t
    where t.transaction_id=v_result.transaction_id for update;
  if v_result.idempotent and v_existing_category is distinct from p_category_id then
    raise exception using errcode='P0001',message='expense_idempotency_category_reused';
  end if;
  update public.personal_expense_transactions t set category_id=p_category_id
    where t.transaction_id=v_result.transaction_id and t.category_id is null;
  update public.family_financial_movements m set category_id=p_category_id
    where m.source_personal_expense_id=v_result.transaction_id and m.category_id is null;
  return query select v_result.transaction_id,v_result.family_id,v_result.owner_user_id,
    v_result.scope,v_result.description,v_result.occurred_on,v_result.total_amount,
    v_result.personal_amount,v_result.family_amount,v_result.family_movement_id,v_result.idempotent;
end;
$function$;
revoke execute on function public.record_personal_expense_transaction_v2(text,text,text,text,date,numeric,numeric,numeric,text,text) from public,anon,authenticated;
grant execute on function public.record_personal_expense_transaction_v2(text,text,text,text,date,numeric,numeric,numeric,text,text) to service_role;
