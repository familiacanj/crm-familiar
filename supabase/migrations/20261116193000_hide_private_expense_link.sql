-- Keep the family movement relation private while allowing the family-safe
-- movement columns to remain directly readable under family membership RLS.
revoke select on public.family_financial_movements from authenticated;
grant select (
  movement_id,
  family_id,
  created_by_user_id,
  kind,
  amount,
  occurred_on,
  description,
  category_id,
  source_rule_id,
  idempotency_key,
  created_at
) on public.family_financial_movements to authenticated;
