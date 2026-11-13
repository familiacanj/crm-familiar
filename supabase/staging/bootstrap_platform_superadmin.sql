-- STAGING ONLY. Run after the verified Google account has signed in to the
-- isolated staging Supabase and after 202611140001_platform_superadmin.sql.
-- Staging Auth users have project-specific UUIDs; this resolves the confirmed
-- owner identity inside the database, then the backend authorizes by that UUID.
do $$
declare
  v_user_id uuid;
  v_user_count integer;
begin
  select count(*), min(id) into v_user_count, v_user_id
  from auth.users
  where lower(email) = 'ajudapopular@gmail.com'
    and email_confirmed_at is not null;

  if v_user_count <> 1 or v_user_id is null then
    raise exception 'Staging must contain exactly one verified authorized Superadministrator identity';
  end if;

  insert into public.platform_superadmins (user_id, role, grant_source)
  values (v_user_id, 'superadmin', 'verified_identity_bootstrap')
  on conflict (user_id) do nothing;
end;
$$;
