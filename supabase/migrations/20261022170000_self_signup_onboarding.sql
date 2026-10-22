-- Self-serve sign-up + onboarding.
--   sign in = sign up   a new email with no invitation gets its own account (named from the email's company domain,
--                       or "<Name>'s company" for gmail-like addresses) and is its admin. Invited emails still just
--                       join the account(s) that invited them.
--   onboarding          per profile: what Saree3's onboarding chat has done that the data can't tell by itself
--                       (company named, demo watched, skipped/finished). First task, team, first hand-off are read
--                       from the real data, so they can never be "faked done".

create table if not exists public.onboarding (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  account_named boolean not null default false,
  demo_seen boolean not null default false,
  dismissed boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.onboarding enable row level security;
drop policy if exists onboarding_own on public.onboarding;
create policy onboarding_own on public.onboarding for select to authenticated using (profile_id = public.current_profile_id());

-- the onboarding chat moves forward: { account_named?, demo_seen?, dismissed?, finished? }
create or replace function public.onboarding_mark(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  insert into public.onboarding (profile_id) values (me) on conflict (profile_id) do nothing;
  update public.onboarding set
    account_named = account_named or coalesce((p ->> 'account_named')::boolean, false),
    demo_seen = demo_seen or coalesce((p ->> 'demo_seen')::boolean, false),
    dismissed = case when p ? 'dismissed' then (p ->> 'dismissed')::boolean else dismissed end,
    finished_at = case when coalesce((p ->> 'finished')::boolean, false) then coalesce(finished_at, now()) else finished_at end
  where profile_id = me;
end;
$$;

-- "What's your company called?" — the admin names their account
create or replace function public.set_account_name(p_name text, p_name_ar text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acc uuid := public.current_account_id();
begin
  if not public.is_admin() then
    raise exception 'Only an admin can rename the account';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'The company needs a name';
  end if;
  update public.accounts
     set name = left(trim(p_name), 80),
         name_ar = coalesce(nullif(trim(coalesce(p_name_ar, '')), ''), case when trim(p_name) ~ '[؀-ۿ]' then left(trim(p_name), 80) else name_ar end)
   where id = acc;
  perform public.onboarding_mark('{"account_named": true}'::jsonb);
end;
$$;

-- sign in = sign up
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

revoke all on function public.onboarding_mark(jsonb) from public, anon;
revoke all on function public.set_account_name(text, text) from public, anon;
grant execute on function public.onboarding_mark(jsonb) to authenticated;
grant execute on function public.set_account_name(text, text) to authenticated;
grant select on public.onboarding to authenticated;
