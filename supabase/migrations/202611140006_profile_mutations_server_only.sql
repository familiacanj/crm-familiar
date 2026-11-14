-- Profile and family-membership changes are mediated by the authenticated API.
-- Keep existing SELECT access/RLS; prevent clients from changing roles or fields
-- directly through PostgREST. The backend service_role retains its privileges.
revoke insert, update, delete, truncate, references, trigger
  on table public.profiles, public.family_memberships
  from anon, authenticated;
