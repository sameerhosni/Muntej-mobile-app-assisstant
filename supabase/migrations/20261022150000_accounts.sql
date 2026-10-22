-- Accounts (multi-tenant). One login can belong to several accounts (a consultant, a group company): each
-- membership is its own profile row (own manager, role, title, capacity there). The account the person is working in
-- is remembered in account_sessions, and current_profile_id() returns the profile of THAT account, so every existing
-- rule (my tasks, my branch, admin) applies inside the active account only.
--   privacy wall   profiles are visible only inside the same account; "admin" rights only reach their own account
--   super admin    s.hosni@t2.sa (role super_admin) may switch into any account: a hidden "seat" profile is made for
--                  them there (role super_admin, hidden from team lists), so they see that whole account
--   sign-in        only invited emails get in: a new login is linked to every profile with that email; no invite,
--                  no profile (the app shows "ask your admin to invite you")

-- ─── accounts ─────────────────────────────────────────────────────────────────
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.accounts enable row level security;

-- everyone who is here today is the first account
insert into public.accounts (id, name, name_ar) values ('00000000-0000-4000-a000-000000000001', 'Muntej', 'منتج')
on conflict (id) do nothing;

alter table public.profiles add column if not exists account_id uuid references public.accounts (id) on delete restrict;
update public.profiles set account_id = '00000000-0000-4000-a000-000000000001' where account_id is null;
alter table public.profiles alter column account_id set not null;
-- the super admin's seat in an account they only look at
alter table public.profiles add column if not exists hidden boolean not null default false;
create index if not exists profiles_account_idx on public.profiles (account_id);

-- one login / email / phone per account (no longer globally)
alter table public.profiles drop constraint if exists profiles_user_id_key;
drop index if exists public.profiles_user_id_key;
create unique index if not exists profiles_user_account_key on public.profiles (user_id, account_id);
drop index if exists public.profiles_email_key;
create unique index if not exists profiles_email_account_key on public.profiles (lower(email), account_id);
alter table public.profiles drop constraint if exists profiles_phone_key;
drop index if exists public.profiles_phone_key;
create unique index if not exists profiles_phone_account_key on public.profiles (phone, account_id);

-- which account each login is working in
create table if not exists public.account_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.account_sessions enable row level security;
drop policy if exists account_sessions_own on public.account_sessions;
create policy account_sessions_own on public.account_sessions for select to authenticated using (user_id = (select auth.uid()));

-- ─── who am I, where am I ─────────────────────────────────────────────────────
create or replace function public.current_account_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.account_id from public.account_sessions s
      where s.user_id = (select auth.uid())
        and exists (select 1 from public.profiles p where p.user_id = s.user_id and p.account_id = s.account_id and p.status <> 'deleted')),
    (select p.account_id from public.profiles p
      where p.user_id = (select auth.uid()) and p.status <> 'deleted'
      order by p.hidden, p.created_at limit 1)
  );
$$;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.profiles
   where user_id = (select auth.uid()) and account_id = public.current_account_id()
   limit 1;
$$;

-- super admin: by login, whichever account they're in
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
     where user_id = (select auth.uid()) and role = 'super_admin' and status <> 'deleted'
  );
$$;

create or replace function public.same_account(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target is not null and exists (select 1 from public.profiles where id = target and account_id = public.current_account_id());
$$;

-- ─── the privacy wall ─────────────────────────────────────────────────────────
-- people: only your account (a hidden super-admin seat is visible only to its owner)
create or replace function public.can_see_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_profile_id() is not null and exists (
    select 1 from public.profiles p
     where p.id = target and p.account_id = public.current_account_id()
       and (not p.hidden or p.id = public.current_profile_id())
  );
$$;

-- "manager of" (and admin rights through it) never cross accounts
create or replace function public.is_manager_of(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target is not null and public.same_account(target)
     and (public.is_admin() or public.is_below(target, public.current_profile_id()));
$$;

-- admins read feature states in their own account only
drop policy if exists feature_events_own on public.feature_events;
create policy feature_events_own on public.feature_events for select to authenticated
  using (profile_id = public.current_profile_id() or (public.is_admin() and public.same_account(profile_id)));

-- accounts: the ones you belong to (all of them for the super admin)
drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts for select to authenticated
  using (public.is_super_admin() or exists (select 1 from public.profiles p where p.account_id = accounts.id and p.user_id = (select auth.uid())));

-- profiles written by a person (not by the system) stay in their account; nobody moves a profile between accounts
create or replace function public.guard_profile_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.account_id is null then
    new.account_id := public.current_account_id();
    if new.account_id is null then
      raise exception 'No account to add this person to';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.account_id is distinct from old.account_id then
    raise exception 'A profile cannot move to another account';
  end if;
  if (select auth.uid()) is not null and not public.is_super_admin()
     and new.account_id is distinct from public.current_account_id()
     and coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid) is distinct from (select auth.uid()) then
    raise exception 'You can only manage people in your own account';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_profile_account on public.profiles;
create trigger guard_profile_account before insert or update on public.profiles for each row execute function public.guard_profile_account();

-- ─── sign-in: invited emails only ─────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- every account this email was invited to
  if new.email is not null then
    update public.profiles set user_id = new.id where lower(email) = lower(new.email) and user_id is null;
  end if;
  if new.phone is not null then
    update public.profiles set user_id = new.id where phone = new.phone and user_id is null;
  end if;
  -- no invitation: no profile (the app says "ask your admin to invite you")
  return new;
end;
$$;

-- an existing login invited to one more account later: link it right away
create or replace function public.link_invited_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null and new.email is not null then
    new.user_id := (select id from auth.users where lower(email) = lower(new.email) limit 1);
  end if;
  return new;
end;
$$;
drop trigger if exists link_invited_profile on public.profiles;
create trigger link_invited_profile before insert on public.profiles for each row execute function public.link_invited_profile();

-- ─── switching ────────────────────────────────────────────────────────────────
-- the accounts this login can open (all of them for the super admin), with the active one marked
create or replace function public.my_accounts()
returns table (id uuid, name text, name_ar text, status text, people bigint, member boolean, active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.name, a.name_ar, a.status,
         (select count(*) from public.profiles p where p.account_id = a.id and not p.hidden and p.status <> 'deleted'),
         exists (select 1 from public.profiles p where p.account_id = a.id and p.user_id = (select auth.uid()) and not p.hidden),
         a.id = public.current_account_id()
    from public.accounts a
   where public.is_super_admin()
      or exists (select 1 from public.profiles p where p.account_id = a.id and p.user_id = (select auth.uid()) and p.status <> 'deleted')
   order by a.name;
$$;

create or replace function public.switch_account(p_account uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  home public.profiles;
  seat uuid;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if not exists (select 1 from public.accounts where id = p_account) then
    raise exception 'Account not found';
  end if;
  select id into seat from public.profiles where user_id = uid and account_id = p_account and status <> 'deleted';
  if seat is null then
    if not public.is_super_admin() then
      raise exception 'You are not a member of that account';
    end if;
    -- the super admin's hidden seat: sees the whole account, never shows up in its team
    select * into home from public.profiles where user_id = uid and role = 'super_admin' order by created_at limit 1;
    insert into public.profiles (user_id, account_id, email, full_name, full_name_ar, role, status, hidden, locale)
    values (uid, p_account, home.email, home.full_name, home.full_name_ar, 'super_admin', 'active', true, home.locale)
    returning id into seat;
  end if;
  insert into public.account_sessions (user_id, account_id) values (uid, p_account)
  on conflict (user_id) do update set account_id = excluded.account_id, updated_at = now();
  return seat;
end;
$$;

revoke all on function public.current_account_id() from public, anon;
revoke all on function public.same_account(uuid) from public, anon;
revoke all on function public.my_accounts() from public, anon;
revoke all on function public.switch_account(uuid) from public, anon;
grant execute on function public.current_account_id() to authenticated;
grant execute on function public.same_account(uuid) to authenticated;
grant execute on function public.my_accounts() to authenticated;
grant execute on function public.switch_account(uuid) to authenticated;
grant select on public.accounts to authenticated;
grant select on public.account_sessions to authenticated;
