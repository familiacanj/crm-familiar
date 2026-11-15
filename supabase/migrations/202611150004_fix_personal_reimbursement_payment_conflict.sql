-- Fix the idempotent reimbursement payment RPC for PostgreSQL output-column
-- name collisions in its ON CONFLICT and UPDATE predicates.
create or replace function public.pay_family_reimbursement(
  p_family_id text,
  p_reimbursement_id text,
  p_paid_by_user_id text,
  p_idempotency_key text
)
returns table (
  payment_id text,
  family_id text,
  reimbursement_id text,
  paid_by_user_id text,
  amount numeric,
  paid_at timestamptz,
  idempotent boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reimbursement public.family_reimbursements%rowtype;
  v_payment public.family_reimbursement_payments%rowtype;
begin
  if not exists (
    select 1 from public.family_memberships fm
    where fm.family_id = p_family_id
      and fm.user_id = p_paid_by_user_id
      and fm.role in ('owner', 'admin')
  ) then
    raise exception 'Somente proprietário ou administrador pode pagar reembolso';
  end if;

  select * into v_payment from public.family_reimbursement_payments p
  where p.family_id = p_family_id and p.idempotency_key = btrim(p_idempotency_key);
  if v_payment.payment_id is not null then
    return query select v_payment.payment_id, v_payment.family_id,
      v_payment.reimbursement_id, v_payment.paid_by_user_id, v_payment.amount,
      v_payment.paid_at, true;
    return;
  end if;

  select * into v_reimbursement from public.family_reimbursements r
  where r.family_id = p_family_id and r.reimbursement_id = p_reimbursement_id;
  if v_reimbursement.reimbursement_id is null then
    raise exception 'Reembolso não encontrado';
  end if;
  if v_reimbursement.status = 'cancelled' then
    raise exception 'Reembolso cancelado';
  end if;

  insert into public.family_reimbursement_payments (
    payment_id, family_id, reimbursement_id, paid_by_user_id, amount, idempotency_key
  ) values (
    'fpay_' || replace(gen_random_uuid()::text, '-', ''), p_family_id,
    v_reimbursement.reimbursement_id, p_paid_by_user_id, v_reimbursement.amount,
    btrim(p_idempotency_key)
  )
  on conflict on constraint family_reimbursement_payments_reimbursement_id_key do nothing
  returning * into v_payment;

  if v_payment.payment_id is null then
    select * into v_payment from public.family_reimbursement_payments p
    where p.reimbursement_id = p_reimbursement_id;
    return query select v_payment.payment_id, v_payment.family_id,
      v_payment.reimbursement_id, v_payment.paid_by_user_id, v_payment.amount,
      v_payment.paid_at, true;
    return;
  end if;

  update public.family_reimbursements r
  set status = 'paid', settled_at = v_payment.paid_at
  where r.reimbursement_id = v_reimbursement.reimbursement_id;

  return query select v_payment.payment_id, v_payment.family_id,
    v_payment.reimbursement_id, v_payment.paid_by_user_id, v_payment.amount,
    v_payment.paid_at, false;
end;
$$;

revoke execute on function public.pay_family_reimbursement(text, text, text, text) from public, anon, authenticated;
grant execute on function public.pay_family_reimbursement(text, text, text, text) to service_role;
