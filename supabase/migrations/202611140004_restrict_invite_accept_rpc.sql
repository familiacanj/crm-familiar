-- The invite acceptance RPC trusts the authenticated user id supplied by the
-- API after validating the bearer token. It must never be callable directly
-- by an end-user role.
revoke all on function public.accept_family_invite(text, text, text)
  from public, anon, authenticated;
grant execute on function public.accept_family_invite(text, text, text)
  to service_role;
