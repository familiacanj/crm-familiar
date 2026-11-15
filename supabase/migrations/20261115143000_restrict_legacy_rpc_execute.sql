-- Staging-only hardening for legacy server-side RPCs.
-- The backend invokes these functions with service_role; browser roles must not
-- be able to supply actor/user identifiers directly to SECURITY DEFINER code.

revoke execute on function public.accept_family_invite(text, text, text)
  from public, anon, authenticated;
revoke execute on function public.current_family_id()
  from public, anon, authenticated;
revoke execute on function public.set_family_member_role(text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.accept_family_invite(text, text, text)
  to service_role;
grant execute on function public.current_family_id()
  to service_role;
grant execute on function public.set_family_member_role(text, text, text, text)
  to service_role;
