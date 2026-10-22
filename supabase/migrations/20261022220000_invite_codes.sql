-- Invite codes: a simple way to bring people into ONE account. A manager or admin gets a code (MNT-7K2P9Q, 7 days,
-- cancellable) and shares it by WhatsApp, email or the share sheet. Whoever signs in with it joins that account at
-- once as an employee under the person who shared it (no approval step: the owner chose "auto"). Someone who
-- already uses Muntej joins it as one more account (accounts switcher).
--   invite_codes       code (6 chars, shown as MNT-XXXXXX), account, manager the joiner reports to, expiry, revoked
--   invite_joins       who joined with which code; notified_at = the inviter got their "X joined" push
--   invite_attempts    failed tries per login (more than 10 in an hour = wait), so codes can't be guessed
--   create_invite_code()    the caller's active code (reused while it has 2+ days left), else a new one
--   revoke_invite_code()    cancel a code (its creator or an admin of the account)
--   redeem_invite(code)     join with a code (idempotent: already a member = just switch to that account)
--   handle_new_user         a brand-new login that signed up with a code joins that account instead of getting its own
create table if not exists public.invite_codes (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  account_id uuid not null references public.accounts (id) on delete cascade,
  manager_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  uses int not null default 0
);
alter table public.invite_codes enable row level security;
drop policy if exists invite_codes_managers on public.invite_codes;
create policy invite_codes_managers on public.invite_codes for select to authenticated
  using (account_id = public.current_account_id()
         and exists (select 1 from public.profiles p where p.id = public.current_profile_id() and p.role <> 'employee'));

create table if not exists public.invite_joins (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  manager_id uuid references public.profiles (id) on delete set null,
  joined_at timestamptz not null default now(),
  notified_at timestamptz
);
alter table public.invite_joins enable row level security;

create table if not exists public.invite_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists invite_attempts_user_at on public.invite_attempts (user_id, at);
alter table public.invite_attempts enable row level security;

/** "mnt-7k2p 9q", "MNT7K2P9Q", "7K2P9Q" → '7K2P9Q' (or '' when it can't be a code) */
create or replace function public.invite_norm(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when length(x) = 6 then x when length(x) = 9 and left(x, 3) = 'MNT' then right(x, 6) else '' end
  from (select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) as x) s;
$$;

/** joins login uid to the code's account (links an invited-by-email profile there, else a new employee profile).
 *  Returns null when the code is unknown, expired or cancelled. Shared by redeem_invite and handle_new_user. */
create or replace function public.join_with_code_inner(uid uuid, p_email text, p_name text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.invite_codes;
  seat uuid;
  joined boolean := false;
  local text := split_part(coalesce(p_email, ''), '@', 1);
begin
  select * into c from public.invite_codes
   where code = public.invite_norm(p_code) and revoked_at is null and expires_at > now();
  if c.code is null then
    return null;
  end if;

  select id into seat from public.profiles where user_id = uid and account_id = c.account_id and status <> 'deleted';
  if seat is null and p_email is not null then
    -- already added there by email: that's them
    update public.profiles set user_id = uid
     where account_id = c.account_id and lower(email) = lower(p_email) and user_id is null and status <> 'deleted'
    returning id into seat;
    joined := seat is not null;
  end if;
  if seat is null then
    insert into public.profiles (user_id, account_id, email, full_name, role, status, manager_id)
    values (uid, c.account_id, lower(p_email),
            coalesce(nullif(trim(p_name), ''), initcap(replace(replace(local, '.', ' '), '_', ' ')), 'New teammate'),
            'employee', 'active', c.manager_id)
    returning id into seat;
    joined := true;
  end if;

  if joined then
    update public.invite_codes set uses = uses + 1 where code = c.code;
    insert into public.invite_joins (code, profile_id, manager_id) values (c.code, seat, c.manager_id);
    insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, undoable)
    values ('user', seat, seat, 'joined_with_code', format('Joined with invite code MNT-%s', c.code),
            format('انضم برمز الدعوة MNT-%s', c.code), false);
  end if;

  -- they land in the account they just joined
  insert into public.account_sessions (user_id, account_id) values (uid, c.account_id)
  on conflict (user_id) do update set account_id = excluded.account_id, updated_at = now();

  return jsonb_build_object(
    'profile_id', seat,
    'account_id', c.account_id,
    'account_name', (select name from public.accounts where id = c.account_id),
    'joined', joined);
end;
$$;

create or replace function public.redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  u record;
  res jsonb;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if (select count(*) from public.invite_attempts where user_id = uid and at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('error', 'too_many');
  end if;
  select email, raw_user_meta_data ->> 'full_name' as full_name into u from auth.users where id = uid;
  res := public.join_with_code_inner(uid, u.email, u.full_name, p_code);
  if res is null then
    insert into public.invite_attempts (user_id) values (uid);
    return jsonb_build_object('error', 'invalid');
  end if;
  return res;
end;
$$;

create or replace function public.create_invite_code()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  c public.invite_codes;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  select * into me from public.profiles where id = public.current_profile_id();
  if me.id is null then
    raise exception 'Not signed in';
  end if;
  if me.role = 'employee' then
    raise exception 'Only managers and admins can invite people';
  end if;
  select * into c from public.invite_codes
   where created_by = me.id and account_id = me.account_id and revoked_at is null and expires_at > now() + interval '2 days'
   order by created_at desc limit 1;
  if c.code is null then
    loop
      candidate := (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
                      from generate_series(1, 6));
      exit when not exists (select 1 from public.invite_codes where code = candidate);
    end loop;
    insert into public.invite_codes (code, account_id, manager_id, created_by)
    values (candidate, me.account_id, case when me.hidden then null else me.id end, me.id)
    returning * into c;
  end if;
  return jsonb_build_object(
    'code', c.code,
    'expires_at', c.expires_at,
    'uses', c.uses,
    'account_name', (select name from public.accounts where id = c.account_id));
end;
$$;

create or replace function public.revoke_invite_code(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where id = public.current_profile_id();
  update public.invite_codes set revoked_at = now()
   where code = public.invite_norm(p_code) and account_id = me.account_id
     and (created_by = me.id or me.role in ('admin', 'super_admin'));
end;
$$;

-- sign-up: a code in the sign-up data means "join that account", not "make me my own"
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked int := 0;
  domain text;
  local text;
  acc uuid;
  prof uuid;
  free boolean;
begin
  -- every account this email was invited to
  if new.email is not null then
    update public.profiles set user_id = new.id where lower(email) = lower(new.email) and user_id is null;
    get diagnostics linked = row_count;
  end if;
  if linked = 0 and new.phone is not null then
    update public.profiles set user_id = new.id where phone = new.phone and user_id is null;
    get diagnostics linked = row_count;
  end if;
  -- signed up with an invite code: that account (a bad code falls through to the usual path)
  if coalesce(new.raw_user_meta_data ->> 'invite_code', '') <> ''
     and public.join_with_code_inner(new.id, new.email, new.raw_user_meta_data ->> 'full_name',
                                     new.raw_user_meta_data ->> 'invite_code') is not null then
    return new;
  end if;
  if linked > 0 or new.email is null then
    return new;
  end if;

  -- nobody invited them: their own new account, with them as its admin
  domain := lower(split_part(new.email, '@', 2));
  local := split_part(new.email, '@', 1);
  free := domain in ('gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'icloud.com',
                     'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'msn.com', 'outlook.sa', 'hotmail.sa');
  insert into public.accounts (name)
  values (case when free then initcap(replace(replace(local, '.', ' '), '_', ' ')) || '''s company'
               else initcap(split_part(domain, '.', 1)) end)
  returning id into acc;

  insert into public.profiles (user_id, account_id, email, full_name, role, status)
  values (new.id, acc, lower(new.email),
          coalesce(new.raw_user_meta_data ->> 'full_name', initcap(replace(replace(local, '.', ' '), '_', ' '))),
          'admin', 'active')
  returning id into prof;

  update public.accounts set created_by = prof where id = acc;
  insert into public.onboarding (profile_id) values (prof) on conflict (profile_id) do nothing;
  insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, undoable)
  values ('user', prof, prof, 'account_signed_up', format('Signed up with %s', new.email), format('سجّل بإيميل %s', new.email), false);
  return new;
end;
$$;

revoke all on function public.invite_norm(text) from public, anon;
revoke all on function public.join_with_code_inner(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.redeem_invite(text) from public, anon;
revoke all on function public.create_invite_code() from public, anon;
revoke all on function public.revoke_invite_code(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.create_invite_code() to authenticated;
grant execute on function public.revoke_invite_code(text) to authenticated;
grant select on public.invite_codes to authenticated;
