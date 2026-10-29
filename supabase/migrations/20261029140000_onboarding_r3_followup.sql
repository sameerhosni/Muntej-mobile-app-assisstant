-- Onboarding release 3, follow-up:
--   · the joined notice in Arabic didn't fit women («مها دخل»): «مها في منتج الحين 🎉» fits everyone
--   · setups left halfway before today get no reminders (they were made with the old setup guide; people wouldn't
--     expect a nudge about it now): only setups from now on are reminded
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
  if old.user_id is not null or new.user_id is null then
    return new;
  end if;
  select i.invited_by into who from public.invites i where i.profile_id = new.id and i.invited_by is not null order by i.sent_at desc limit 1;
  who := coalesce(who, new.manager_id);
  if who is null or who = new.id then
    return new;
  end if;
  select count(*) filter (where p.user_id is not null), count(*),
         string_agg(split_part(p.full_name, ' ', 1), ', ') filter (where p.user_id is null),
         string_agg(split_part(coalesce(nullif(p.full_name_ar, ''), p.full_name), ' ', 1), '، ') filter (where p.user_id is null)
    into joined, total, waiting, waiting_ar
    from public.profiles p
   where p.account_id = new.account_id and p.status <> 'deleted' and coalesce(p.hidden, false) = false and p.id <> who
     and (p.manager_id = who or exists (select 1 from public.invites i where i.profile_id = p.id and i.invited_by = who));
  insert into public.alerts (profile_id, kind, subject_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    who, 'member_joined', new.id,
    format('%s is on Muntej now 🎉', name_en),
    case when waiting is null then format('Everyone is in (%s). Give them a first task!', total)
         else format('%s of %s are in. Still waiting: %s', joined, total, left(waiting, 120)) end,
    format('%s في منتج الحين 🎉', name_ar),
    case when waiting_ar is null then format('كلهم صاروا في منتج (%s). عطهم أول مهمة!', total)
         else format('صاروا %s من %s. باقي: %s', joined, total, left(waiting_ar, 120)) end,
    'joined:' || new.id
  )
  on conflict (dedupe_key) do nothing;
  insert into public.activity_log (actor_type, subject_id, action, summary, summary_ar, reason, undoable)
  values ('muntej', new.id, 'member_joined_notice', format('Told the inviter that %s joined', new.full_name),
          format('بلّغت اللي دعاه إن %s صار في منتج', name_ar), 'first sign-in', false);
  return new;
end;
$$;

update public.onboarding set nudges = 2 where finished_at is null and started_at < now() and nudges < 2;
