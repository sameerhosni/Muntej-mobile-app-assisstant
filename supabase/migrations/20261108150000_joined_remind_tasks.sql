-- Someone you invited joins (owner, 8 Nov: "Notify me if anyone I invited joined the account and remind him of his
-- tasks once joined"). The inviter was already told "X joined"; now the person who joined also hears, right away, the
-- tasks already waiting for them (push + Alerts, opening the first one), and the inviter's notice says so.

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
  open_n integer;
  first_task uuid;
  titles text;
  name_en text := split_part(new.full_name, ' ', 1);
  name_ar text := split_part(coalesce(nullif(new.full_name_ar, ''), new.full_name), ' ', 1);
begin
  if new.user_id is null or not (old.status = 'pending' and new.status = 'active') then
    return new;
  end if;

  -- their work already waiting: the first three by due date, the count of all
  select count(*), (array_agg(t.id order by t.due_at nulls last, t.created_at))[1],
         string_agg('• ' || left(t.title, 60), E'\n' order by t.due_at nulls last, t.created_at) filter (where t.rn <= 3)
    into open_n, first_task, titles
    from (
      select x.*, row_number() over (order by x.due_at nulls last, x.created_at) as rn
        from public.tasks x
       where x.owner_id = new.id and x.status in ('draft', 'assigned', 'in_progress', 'blocked', 'returned')
    ) t;
  if open_n > 0 then
    insert into public.alerts (profile_id, kind, task_id, subject_id, title, body, title_ar, body_ar, dedupe_key)
    values (
      new.id, 'task_assigned', first_task, new.id,
      case when open_n = 1 then 'Welcome! A task is waiting for you' else format('Welcome! %s tasks are waiting for you', open_n) end,
      titles,
      case when open_n = 1 then 'هلا فيك! عندك مهمة تنتظرك' else format('هلا فيك! عندك %s مهام تنتظرك', open_n) end,
      titles,
      'joined_tasks:' || new.id
    )
    on conflict (dedupe_key) do nothing;
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
    (case when waiting is null then format('Everyone is in (%s). Give them a first task!', total)
          else format('%s of %s are in. Still waiting: %s', joined, total, left(waiting, 120)) end)
      || case when open_n > 0 then format(E'\nI reminded them of their %s open task(s).', open_n) else '' end,
    -- an Arabic word first, so a Latin name can't swap sides
    format('دخل %s منتج 🎉', name_ar),
    (case when waiting_ar is null then format('كلهم دخلوا (%s). عطهم أول مهمة!', total)
          else format('صاروا %s من %s. باقي: %s', joined, total, left(waiting_ar, 120)) end)
      || case when open_n > 0 then format(E'\nذكّرته بمهامه المفتوحة (%s).', open_n) else '' end,
    'joined:' || new.id
  )
  on conflict (dedupe_key) do nothing;
  insert into public.activity_log (actor_type, subject_id, action, summary, summary_ar, reason, undoable)
  values ('muntej', new.id, 'member_joined_notice',
          format('Told the inviter that %s joined%s', new.full_name, case when open_n > 0 then format(' and reminded them of %s open task(s)', open_n) else '' end),
          format('بلّغت اللي دعاه إن %s دخل%s', name_ar, case when open_n > 0 then format('، وذكّرته بمهامه (%s)', open_n) else '' end),
          'first sign-in', false);
  return new;
end;
$$;
