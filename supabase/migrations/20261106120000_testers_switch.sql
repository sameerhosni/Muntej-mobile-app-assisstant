-- Test before live (owner, 6 Nov: "Uploading all new enhancements directly to the live is not the best option. Let's
-- create a new version for testing before going live and once updates approved we can go live"). The app update goes
-- to the Muntej Test app first (channel preview); the server is one for everyone, so a new feature waits behind this
-- switch: features.testing = only testers see it (What's New, Saree3's nudges, its server actions) until
-- `npm run ship -- --live` turns it on for everyone.

alter table public.profiles add column if not exists tester boolean not null default false;
alter table public.features add column if not exists testing boolean not null default false;

-- a tester is a login (any of its company seats), so switching company keeps it
create or replace function public.is_tester()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.tester and p.status <> 'deleted');
$$;
revoke all on function public.is_tester() from public, anon;
grant execute on function public.is_tester() to authenticated;

-- a feature is on for this person: live for everyone, or in testing and they test
create or replace function public.feature_on(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select not f.testing or public.is_tester() from public.features f where f.key = p_key), true);
$$;
revoke all on function public.feature_on(text) from public, anon;
grant execute on function public.feature_on(text) to authenticated;

drop policy if exists features_read on public.features;
create policy features_read on public.features for select to authenticated using (not testing or public.is_tester());

-- the owner tests (every seat of their login), and so does the QA manager
update public.profiles set tester = true
 where user_id in (select user_id from public.profiles where id = '00000000-0000-4000-a000-000000000001' and user_id is not null)
    or id = 'a0000000-0000-4000-b000-000000000010';

-- Team from your mail is the first feature to wait for approval
update public.features set testing = true where key = 'team_from_mail';
