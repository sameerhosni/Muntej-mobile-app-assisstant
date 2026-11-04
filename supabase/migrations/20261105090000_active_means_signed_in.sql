-- "Active" and "joined" meant nothing (owner, 5 Nov: "You added 3 active but no one received the invitation yet and no
-- one accept it neither login to the account"). Sending an email invitation creates the login, and the link to it made
-- the person active and told the manager they joined. Restoring someone did the same. Now:
--   * a seat is active only once that login has really signed in (or they open the company, switch_account),
--   * the manager hears "joined" only then,
--   * the two people this reached go back to waiting, so the Team screen tells the truth and M Faisal's card comes back.

-- a login nobody has used doesn't make anyone active
create or replace function public.activate_on_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.user_id is null and new.user_id is not null and new.status = 'pending'
     and exists (select 1 from auth.users u where u.id = new.user_id and (u.last_sign_in_at is not null or u.email_confirmed_at is not null)) then
    new.status := 'active';
  end if;
  return new;
end;
$$;

-- their first real sign-in. With seats in several companies, the app asks which to open (my_new_companies).
create or replace function public.activate_on_first_sign_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.last_sign_in_at is null and new.last_sign_in_at is not null) or (old.email_confirmed_at is null and new.email_confirmed_at is not null) then
    update public.profiles p set status = 'active'
     where p.user_id = new.id and p.status = 'pending'
       and (select count(*) from public.profiles o where o.user_id = new.id and o.status <> 'deleted') = 1;
  end if;
  return new;
exception when others then
  return new; -- never block a sign-in on this
end;
$$;
drop trigger if exists activate_on_first_sign_in on auth.users;
create trigger activate_on_first_sign_in after update of last_sign_in_at, email_confirmed_at on auth.users
  for each row execute function public.activate_on_first_sign_in();

-- "joined" = they went from waiting to active, nothing else
create or replace function public.invites_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status = 'active' and new.user_id is not null then
    update public.invites set status = 'joined', joined_at = now() where profile_id = new.id and status <> 'joined';
  end if;
  return new;
end;
$$;

create or replace function public.member_joined_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid;
  joined integer;
  total integer;
  waiting text;
  waiting_ar text;
  name_en text := split_part(new.full_name, ' ', 1);
  name_ar text := split_part(coalesce(nullif(new.full_name_ar, ''), new.full_name), ' ', 1);
begin
  if new.user_id is null or not (old.status = 'pending' and new.status = 'active') then
    return new;
  end if;
  -- whoever sent the latest invite, else their manager
  select i.invited_by into who from public.invites i where i.profile_id = new.id and i.invited_by is not null order by i.sent_at desc limit 1;
  who := coalesce(who, new.manager_id);
  if who is null or who = new.id then
    return new;
  end if;
  -- the people that person brought in (or manages): how many are in, who's still waiting
  select count(*) filter (where p.status = 'active'), count(*),
         string_agg(split_part(p.full_name, ' ', 1), ', ') filter (where p.status <> 'active'),
         string_agg(split_part(coalesce(nullif(p.full_name_ar, ''), p.full_name), ' ', 1), '، ') filter (where p.status <> 'active')
    into joined, total, waiting, waiting_ar
    from public.profiles p
   where p.account_id = new.account_id and p.status <> 'deleted' and coalesce(p.hidden, false) = false and p.id <> who
     and (p.manager_id = who or exists (select 1 from public.invites i where i.profile_id = p.id and i.invited_by = who));
  insert into public.alerts (profile_id, kind, subject_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    who, 'member_joined', new.id,
    format('%s joined Muntej 🎉', name_en),
    case when waiting is null then format('Everyone is in (%s). Give them a first task!', total)
         else format('%s of %s are in. Still waiting: %s', joined, total, left(waiting, 120)) end,
    format('%s دخل منتج 🎉', name_ar),
    case when waiting_ar is null then format('كلهم دخلوا (%s). عطهم أول مهمة!', total)
         else format('صاروا %s من %s. باقي: %s', joined, total, left(waiting_ar, 120)) end,
    'joined:' || new.id
  )
  on conflict (dedupe_key) do nothing;
  insert into public.activity_log (actor_type, subject_id, action, summary, summary_ar, reason, undoable)
  values ('muntej', new.id, 'member_joined_notice', format('Told the inviter that %s joined', new.full_name),
          format('بلّغت اللي دعاه إن %s دخل', name_ar), 'first sign-in', false);
  return new;
end;
$$;

-- who hasn't really joined: never signed in at all, or told inside Muntej and hasn't opened this company
create or replace function public.seat_not_joined(p_seat uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is null
      or exists (select 1 from auth.users u where u.id = p_user and u.last_sign_in_at is null)
      or coalesce((select i.channel = 'app' and i.status <> 'joined' from public.invites i where i.profile_id = p_seat order by i.sent_at desc limit 1), false);
$$;
revoke all on function public.seat_not_joined(uuid, uuid) from public, anon, authenticated;

-- restoring someone puts them back where they were, not "active"
create or replace function public.restored_stays_waiting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'deleted' and new.status = 'active' and public.seat_not_joined(new.id, new.user_id) then
    new.status := 'pending';
  end if;
  return new;
end;
$$;
drop trigger if exists restored_stays_waiting on public.profiles;
create trigger restored_stays_waiting before update of status on public.profiles
  for each row execute function public.restored_stays_waiting();

-- the people this reached go back to waiting; a "joined" alert that wasn't true must not block the real one
do $$
declare
  r record;
begin
  for r in
    select p.id, p.full_name, coalesce(nullif(p.full_name_ar, ''), p.full_name) name_ar
      from public.profiles p
     where p.status = 'active' and coalesce(p.hidden, false) = false and p.user_id is not null and public.seat_not_joined(p.id, p.user_id)
  loop
    update public.profiles set status = 'pending' where id = r.id;
    update public.alerts set dedupe_key = dedupe_key || ':not-true', read_at = coalesce(read_at, now()) where dedupe_key = 'joined:' || r.id;
    insert into public.activity_log (actor_type, subject_id, action, summary, summary_ar, reason, undoable)
    values ('muntej', r.id, 'status_corrected', format('%s is back to waiting: they have not joined yet', r.full_name),
            format('رجّعت %s للانتظار: لسا ما دخل', r.name_ar), 'was marked active without signing in or opening the company', false);
  end loop;
end $$;
