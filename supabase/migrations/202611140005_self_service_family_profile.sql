-- Add a private-storage pointer for each authenticated account's own profile photo.
-- Existing Google picture URLs and all family/financial data remain untouched.
alter table public.profiles
  add column if not exists profile_photo_path text;

comment on column public.profiles.profile_photo_path is
  'Path to the account owner photo in the private family-member-photos bucket; writes are mediated by the authenticated CRM API.';

-- Keep access server-mediated: clients do not receive direct table write grants or
-- Storage object policies for this photo. The API scopes writes to auth.uid().
