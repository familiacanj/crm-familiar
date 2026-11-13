-- Optional kinship label for budget people. This is descriptive profile data,
-- independent from authenticated accounts and family authorization roles.
-- Existing rows remain unchanged and read as NULL until edited by the family.
alter table public.members
  add column if not exists relationship text;

comment on column public.members.relationship is
  'Optional family relationship label; descriptive only and never used for authorization.';
