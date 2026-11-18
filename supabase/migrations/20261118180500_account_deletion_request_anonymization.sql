-- Preserve the request record after the account profile has been removed.
-- This changes only the FK behavior and nullability; it does not delete rows.
alter table public.account_data_deletion_requests
  alter column user_id drop not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.account_data_deletion_requests'::regclass
      and conname = 'account_data_deletion_requests_user_id_fkey'
  ) then
    alter table public.account_data_deletion_requests
      drop constraint account_data_deletion_requests_user_id_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.account_data_deletion_requests'::regclass
      and conname = 'account_data_deletion_requests_user_id_fkey'
  ) then
    alter table public.account_data_deletion_requests
      add constraint account_data_deletion_requests_user_id_fkey
      foreign key (user_id) references public.profiles(user_id) on delete set null;
  end if;
end
$$;
