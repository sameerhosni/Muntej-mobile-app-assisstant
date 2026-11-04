-- Telling people they were added (owner's employee, 4 Nov: "I downloaded the app, but never found any notification to
-- join"). Someone who already has a Muntej login was linked to the new company silently: no email, no alert, and the
-- company only showed in Settings, still "pending". Now:
--   * they hear it in the company they're in (alert added_to_company: push, the Alerts list, email),
--   * my_new_companies() lets the app offer the new company with one tap,
--   * opening it (switch_account) makes them active, and the manager hears they joined,
--   * invites has two more channels so the Team screen can say how each person was told:
--     'app' (told inside Muntej) and 'link' (a join link the manager shared, for people with no email or mobile).

alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind in (
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
  'objective_achieved', 'objective_at_risk', 'objective_missed', 'changed_for_you',
  'task_assigned', 'new_submission', 'decision_waiting', 'no_reply', 'escalated', 'tool_sync', 'new_feature',
  'request_answered', 'ladder_nudge', 'support_reply', 'idea_update', 'member_joined', 'added_to_company'
));

alter table public.invites drop constraint if exists invites_channel_check;
alter table public.invites add constraint invites_channel_check check (channel in ('whatsapp', 'email', 'app', 'link'));

-- One tell a day at most (the Team screen's Send again uses this too). False = nothing was sent: they've no other
-- company to hear it in, they're in already, or they were told today.
create or replace function public.tell_added_person(p_person uuid, p_by uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  seat public.profiles;
  home uuid;
  company text;
  company_ar text;
  by_en text;
  by_ar text;
  sent integer;
begin
  select * into seat from public.profiles where id = p_person;
  if seat.id is null or seat.user_id is null or seat.status <> 'pending' or coalesce(seat.hidden, false) then
    return false;
  end if;
  -- the company they're working in now, where their Alerts list and phone are
  select p.id into home
    from public.profiles p
    left join public.account_sessions s on s.user_id = p.user_id and s.account_id = p.account_id
   where p.user_id = seat.user_id and p.id <> seat.id and p.status <> 'deleted' and coalesce(p.hidden, false) = false
   order by s.account_id is null, p.created_at
   limit 1;
  if home is null then
    return false;
  end if;
  select a.name, coalesce(nullif(a.name_ar, ''), a.name) into company, company_ar from public.accounts a where a.id = seat.account_id;
  select split_part(p.full_name, ' ', 1), split_part(coalesce(nullif(p.full_name_ar, ''), p.full_name), ' ', 1)
    into by_en, by_ar
    from public.profiles p where p.id = coalesce(p_by, seat.manager_id);

  insert into public.alerts (profile_id, kind, subject_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    home, 'added_to_company', seat.id,
    case when by_en is null then format('You were added to %s', company) else format('%s added you to %s', by_en, company) end,
    'Open Muntej and tap Open on the card to join your team.',
    case when by_ar is null then format('انضفت لـ %s', company_ar) else format('%s أضافك لـ %s', by_ar, company_ar) end,
    'افتح منتج واضغط «افتحها» في البطاقة عشان تدخل مع فريقك.',
    'added:' || seat.id || ':' || (now() at time zone 'Asia/Riyadh')::date
  )
  on conflict (dedupe_key) do nothing;
  get diagnostics sent = row_count;
  if sent = 0 then
    return false;
  end if;

  insert into public.invites (account_id, profile_id, invited_by, channel, status)
  values (seat.account_id, seat.id, coalesce(p_by, seat.manager_id), 'app', 'sent');
  insert into public.activity_log (actor_type, subject_id, action, summary, summary_ar, reason, undoable)
  values ('muntej', seat.id, 'told_added_person', format('Told %s they were added to %s', seat.full_name, company),
          format('بلّغت %s إنه انضاف لـ %s', coalesce(nullif(seat.full_name_ar, ''), seat.full_name), company_ar),
          'already has a Muntej login, so no invitation goes out', false);
  return true;
end;
$$;
revoke all on function public.tell_added_person(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tell_added_person(uuid, uuid) to service_role;

-- every way in ends here (Team form, chat, team import, API): an existing login linked to one more company
create or replace function public.added_to_company_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and new.status = 'pending' then
    perform public.tell_added_person(new.id, public.current_profile_id());
  end if;
  return new;
end;
$$;
drop trigger if exists added_to_company_notice on public.profiles;
create trigger added_to_company_notice after insert on public.profiles for each row execute function public.added_to_company_notice();

-- the companies this login was added to and hasn't opened yet
create or replace function public.my_new_companies()
returns table (account_id uuid, name text, name_ar text, added_by text, added_by_ar text, active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.account_id, a.name, a.name_ar,
         split_part(by.full_name, ' ', 1),
         split_part(coalesce(nullif(by.full_name_ar, ''), by.full_name), ' ', 1),
         s.account_id = public.current_account_id()
    from public.profiles s
    join public.accounts a on a.id = s.account_id
    left join public.profiles by on by.id = coalesce(
      (select i.invited_by from public.invites i where i.profile_id = s.id and i.invited_by is not null order by i.sent_at desc limit 1),
      s.manager_id)
   where s.user_id = (select auth.uid()) and s.status = 'pending' and coalesce(s.hidden, false) = false
   order by s.created_at desc;
$$;
revoke all on function public.my_new_companies() from public, anon;
grant execute on function public.my_new_companies() to authenticated;

-- how each person in this company was told (Team screen): the latest invite only, without its tokens
create or replace function public.team_invite_states()
returns table (profile_id uuid, channel text, status text, sent_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (i.profile_id) i.profile_id, i.channel, i.status, i.sent_at
    from public.invites i
   where i.account_id = public.current_account_id()
   order by i.profile_id, i.sent_at desc;
$$;
revoke all on function public.team_invite_states() from public, anon;
grant execute on function public.team_invite_states() to authenticated;

-- opening a company they were added to = joining it
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
  update public.profiles set status = 'active' where id = seat and status = 'pending';
  insert into public.account_sessions (user_id, account_id) values (uid, p_account)
  on conflict (user_id) do update set account_id = excluded.account_id, updated_at = now();
  return seat;
end;
$$;

-- "joined" now also means a login that was already there opening the company
create or replace function public.invites_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.user_id is null and new.user_id is not null) or (old.status = 'pending' and new.status = 'active' and new.user_id is not null) then
    update public.invites set status = 'joined', joined_at = now() where profile_id = new.id and status <> 'joined';
  end if;
  return new;
end;
$$;
drop trigger if exists invites_joined on public.profiles;
create trigger invites_joined after update of user_id, status on public.profiles for each row execute function public.invites_joined();

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
  if new.user_id is null or not (old.user_id is null or (old.status = 'pending' and new.status = 'active')) then
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
drop trigger if exists member_joined_notice on public.profiles;
create trigger member_joined_notice after update of user_id, status on public.profiles for each row execute function public.member_joined_notice();

-- What's new: on Team, a manager sees who was really told
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('invite_status', 'manager', now(), 'See who was really told',
   'اعرف مين وصلته الدعوة',
   'Team now shows who was told, who opened the invite and who joined, and who I can’t reach, with one tap to invite them.',
   'الفريق صار يوريك مين وصلته الدعوة، مين فتحها، مين دخل، ومين ما أقدر أوصل له، وبضغطة تدعوهم.', -20)
on conflict (key) do nothing;

-- people added in the last two weeks who were never told (the owner's employee among them)
do $$
declare
  r record;
begin
  for r in
    select id, manager_id from public.profiles
     where user_id is not null and status = 'pending' and coalesce(hidden, false) = false and created_at > now() - interval '14 days'
  loop
    perform public.tell_added_person(r.id, r.manager_id);
  end loop;
end $$;
