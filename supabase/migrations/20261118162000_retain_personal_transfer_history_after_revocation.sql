-- Personal-to-family transfer rows are part of the owner's private ledger.
-- Keep the owner's read access after family removal; shared cash movements
-- remain protected by the active-membership policies on family tables.
drop policy if exists personal_family_transfers_owner_only
  on public.personal_family_transfers;

create policy personal_family_transfers_owner_only
  on public.personal_family_transfers for select to authenticated
  using (owner_user_id = (select auth.uid())::text);
