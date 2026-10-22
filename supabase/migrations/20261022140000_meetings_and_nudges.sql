-- 1) A meeting recorded in the room (Record a meeting): its transcript becomes an incoming item, source 'meeting'.
alter table public.incoming_items drop constraint if exists incoming_items_source_check;
alter table public.incoming_items add constraint incoming_items_source_check
  check (source in ('paste', 'share', 'meeting', 'email', 'whatsapp', 'teams', 'slack', 'jira', 'outlook', 'calendar',
                    'google_chat', 'meet', 'gmail', 'clickup', 'trello', 'notion', 'azure_devops'));

-- 2) "Remind them for me" on Waiting on others: Muntej sends the person you're waiting on a polite reminder in
--    your name (push now; it's an exception the budget lets through), at most once a day per item, and logs it.
--    Allowed when you're waiting on them for real: a decision you asked them for, or a blocked task where you are
--    the owner (reminding the helper / assigner) or the helper (reminding the owner).
create or replace function public.nudge_waiting(p_to uuid, p_task uuid, p_decision uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  ok boolean := false;
  who text;
  who_ar text;
  title text;
begin
  if p_to is null or p_to = me then
    raise exception 'Nobody to remind';
  end if;
  if p_decision is not null then
    select exists (select 1 from public.decisions d where d.id = p_decision and d.requested_by = me and d.manager_id = p_to and d.status = 'pending')
      into ok;
    select coalesce(d.title, '') into title from public.decisions d where d.id = p_decision;
  elsif p_task is not null then
    select exists (
      select 1 from public.tasks t
       where t.id = p_task
         and ((t.owner_id = me and p_to in (t.helper_id, t.assigner_id)) or (t.helper_id = me and p_to = t.owner_id))
    ) into ok;
    select coalesce(t.title, '') into title from public.tasks t where t.id = p_task;
  end if;
  if not ok then
    raise exception 'You can only remind someone you are waiting on';
  end if;

  select split_part(full_name, ' ', 1), split_part(coalesce(full_name_ar, full_name), ' ', 1) into who, who_ar
    from public.profiles where id = me;
  insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    p_to, 'no_reply', me, p_task,
    left(format('%s is waiting on you: %s', who, title), 200),
    left(coalesce(nullif(trim(p_message), ''), 'A quick answer would unblock them.'), 400),
    left(format('%s ينتظرك: %s', who_ar, title), 200),
    left(coalesce(nullif(trim(p_message), ''), 'رد سريع منك يمشّي شغله.'), 400),
    'nudge:' || coalesce(p_decision, p_task) || ':' || p_to || ':' || to_char(now() at time zone 'Asia/Riyadh', 'YYYYMMDD')
  )
  on conflict (dedupe_key) do nothing;

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
  -- subject = me: a log about the other person would also send them a "changed for you" notice
  values ('user', me, me, p_task, 'waiting_nudged',
          format('Asked Muntej to remind them about "%s"', title), format('طلب من منتج يذكّرهم بـ«%s»', title), false);
end;
$$;

revoke all on function public.nudge_waiting(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.nudge_waiting(uuid, uuid, uuid, text) to authenticated;
