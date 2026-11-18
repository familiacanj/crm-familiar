-- Private, owner-initiated account erasure requests. This records an explicit
-- request without deleting shared family history or making an unreviewed legal
-- retention decision. Only the server-side service role can read or write it.
create table if not exists public.account_data_deletion_requests (
  request_id text primary key,
  user_id text not null references public.profiles(user_id) on delete restrict,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'withdrawn', 'processing', 'completed', 'declined')),
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz not null default now(),
  updated_at timestamptz,
  resolved_at timestamptz,
  resolution_code text check (resolution_code is null or resolution_code in ('completed', 'declined'))
);

create unique index if not exists account_data_deletion_requests_one_pending_per_user
  on public.account_data_deletion_requests(user_id)
  where status in ('pending_review', 'processing');

create index if not exists account_data_deletion_requests_status_requested_idx
  on public.account_data_deletion_requests(status, requested_at);

alter table public.account_data_deletion_requests enable row level security;
revoke all on table public.account_data_deletion_requests from public, anon, authenticated;
grant all on table public.account_data_deletion_requests to service_role;

comment on table public.account_data_deletion_requests is
  'Private, authenticated account-erasure requests. Processing requires an approved retention decision; no account or family data is deleted by request creation.';
