-- Keep the private purchase description out of the shared family ledger.
-- Existing safe columns and family-member RLS remain available.
revoke select (description) on table public.family_financial_movements from authenticated;

-- Carry forward the real cash balance from previous periods. Direct household
-- purchases paid personally are contributions/expenses, never cash movements.
create or replace function public.calculate_family_cash_opening_balance(
  p_family_id text,
  p_before date
)
returns table (opening_balance numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce((
      select sum(case
        when m.kind in ('cash_contribution', 'personal_to_family_transfer') then m.amount
        when m.kind in ('family_to_personal_transfer', 'family_cash_expense') then -m.amount
        else 0
      end)
      from public.family_financial_movements m
      where m.family_id = p_family_id and m.occurred_on < p_before
    ), 0)
    - coalesce((
      select sum(rp.amount)
      from public.family_reimbursement_payments rp
      where rp.family_id = p_family_id and rp.paid_at < p_before
    ), 0)
    - coalesce((
      select sum(coalesce((
        select e.value
        from public.entries e
        where e.family_id = bp.family_id
          and e.ref_id = bp.category_id
          and e.year = bp.year
          and e.month = bp.month
        limit 1
      ), c.default_value))
      from public.bill_payments bp
      join public.categories c
        on c.family_id = bp.family_id and c.category_id = bp.category_id
      where bp.family_id = p_family_id
        and (bp.year, bp.month) < (extract(year from p_before)::integer, extract(month from p_before)::integer)
    ), 0) as opening_balance;
$$;

revoke all on function public.calculate_family_cash_opening_balance(text, date)
  from public, anon, authenticated;
grant execute on function public.calculate_family_cash_opening_balance(text, date)
  to service_role;
