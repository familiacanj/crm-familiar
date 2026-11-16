-- Harden legacy public-schema helpers without breaking RLS policies that use
-- current_family_id().  Role mutations remain backend-only; the event-trigger
-- helper is never callable by browser roles.
do $$
begin
  if to_regprocedure('public.current_family_id()') is not null then
    alter function public.current_family_id() security invoker;
    revoke execute on function public.current_family_id() from public, anon;
    grant execute on function public.current_family_id() to authenticated, service_role;
  end if;

  if to_regprocedure('public.set_family_member_role(text, text, text, text)') is not null then
    revoke execute on function public.set_family_member_role(text, text, text, text)
      from public, anon, authenticated;
    grant execute on function public.set_family_member_role(text, text, text, text)
      to service_role;
  end if;

  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
