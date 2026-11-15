-- Qualify the reimbursement RETURNING column because the RPC also exposes an
-- output column with the same name.
create or replace function public.record_family_financial_movement(
  p_family_id text,
  p_created_by_user_id text,
  p_kind text,
  p_amount numeric,
  p_occurred_on date,
  p_description text,
  p_idempotency_key text,
  p_category_id text default null,
  p_source_rule_id text default null,
  p_reimbursement_requested boolean default false
)
returns table (
  movement_id text,
  family_id text,
  created_by_user_id text,
  kind text,
  amount numeric,
  occurred_on date,
  description text,
  category_id text,
  source_rule_id text,
  reimbursement_id text,
  idempotent boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_movement public.family_financial_movements%rowtype;
  v_reimbursement_id text;
begin
  if p_kind not in ('cash_contribution', 'direct_family_expense') then
    raise exception 'Tipo de movimentação inválido';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor deve ser maior que zero';
  end if;
  if not exists (
    select 1 from public.family_memberships fm
    where fm.family_id = p_family_id and fm.user_id = p_created_by_user_id
  ) then
    raise exception 'Usuário não pertence à família';
  end if;
  if p_reimbursement_requested and p_kind <> 'direct_family_expense' then
    raise exception 'Somente despesa familiar direta pode gerar reembolso';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories c
    where c.category_id = p_category_id and c.family_id = p_family_id
  ) then
    raise exception 'Categoria não pertence à família';
  end if;
  if p_source_rule_id is not null and not exists (
    select 1 from public.family_contribution_rules cr
    where cr.rule_id = p_source_rule_id
      and cr.family_id = p_family_id
      and cr.owner_user_id = p_created_by_user_id
  ) then
    raise exception 'Regra de contribuição não pertence ao usuário';
  end if;

  insert into public.family_financial_movements (
    movement_id, family_id, created_by_user_id, kind, amount, occurred_on,
    description, category_id, source_rule_id, idempotency_key
  ) values (
    'fmove_' || replace(gen_random_uuid()::text, '-', ''), p_family_id,
    p_created_by_user_id, p_kind, round(p_amount, 2), p_occurred_on,
    btrim(p_description), p_category_id, p_source_rule_id, btrim(p_idempotency_key)
  )
  on conflict on constraint family_financial_movements_family_id_idempotency_key_key do nothing
  returning * into v_movement;

  if v_movement.movement_id is null then
    select * into v_movement from public.family_financial_movements m
    where m.family_id = p_family_id and m.idempotency_key = btrim(p_idempotency_key);
    select r.reimbursement_id into v_reimbursement_id
    from public.family_reimbursements r
    where r.expense_movement_id = v_movement.movement_id;
    return query select v_movement.movement_id, v_movement.family_id,
      v_movement.created_by_user_id, v_movement.kind, v_movement.amount,
      v_movement.occurred_on, v_movement.description, v_movement.category_id,
      v_movement.source_rule_id, v_reimbursement_id, true;
    return;
  end if;

  if p_reimbursement_requested then
    insert into public.family_reimbursements (
      reimbursement_id, family_id, expense_movement_id, requested_by_user_id,
      amount, description
    ) values (
      'freimb_' || replace(gen_random_uuid()::text, '-', ''), p_family_id,
      v_movement.movement_id, p_created_by_user_id, v_movement.amount,
      v_movement.description
    ) returning public.family_reimbursements.reimbursement_id into v_reimbursement_id;
  end if;

  return query select v_movement.movement_id, v_movement.family_id,
    v_movement.created_by_user_id, v_movement.kind, v_movement.amount,
    v_movement.occurred_on, v_movement.description, v_movement.category_id,
    v_movement.source_rule_id, v_reimbursement_id, false;
end;
$$;

revoke execute on function public.record_family_financial_movement(text, text, text, numeric, date, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_family_financial_movement(text, text, text, numeric, date, text, text, text, text, boolean) to service_role;
