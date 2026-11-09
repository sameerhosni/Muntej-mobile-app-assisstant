-- N6 (owner, 9 Nov): "although I said I was busy, and the manager approved, it is still showing on my tasks with
-- «استلمت»". Approving a "busy" request (priority_question) only sent an alert; the task never moved. Now the one who
-- agrees takes it back: the task becomes theirs (status assigned, Muntej's reminders to her stop), so it leaves her
-- list and they can give it to someone else. Logged, and she hears it in the answer alert.

create or replace function public.busy_agreed_back_to_giver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
begin
  if new.type <> 'priority_question' or new.status <> 'approved' or old.status = 'approved' or new.task_id is null then
    return new;
  end if;
  select * into t from public.tasks where id = new.task_id;
  if t.id is null or t.owner_id is distinct from new.requested_by
     or t.status not in ('draft', 'assigned', 'in_progress', 'blocked', 'returned') then
    return new;
  end if;

  update public.tasks set owner_id = new.manager_id, helper_id = null, status = 'assigned' where id = t.id;
  update public.followups set status = 'cancelled' where task_id = t.id and status = 'scheduled';
  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, reason, undoable)
  values ('user', coalesce(new.resolved_by, new.manager_id), new.requested_by, t.id, 'busy_taken_back',
          format('Agreed they''re busy: "%s" came back to them', t.title),
          format('وافق إنه مشغول: «%s» رجعت له', t.title),
          new.recommendation_reason, false);
  return new;
end;
$$;

drop trigger if exists decisions_busy_back on public.decisions;
create trigger decisions_busy_back after update of status on public.decisions
  for each row execute function public.busy_agreed_back_to_giver();

-- her answer alert says where it went
create or replace function public.notify_request_answered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text;
  who_ar text;
  task_title text;
  new_due timestamptz;
  when_en text;
  when_ar text;
begin
  if old.status <> 'pending' or new.status not in ('approved', 'declined') or new.requested_by is null
     or new.requested_by = coalesce(new.resolved_by, new.manager_id) then
    return new;
  end if;
  select split_part(full_name, ' ', 1), split_part(coalesce(full_name_ar, full_name), ' ', 1)
    into who, who_ar from public.profiles where id = coalesce(new.resolved_by, new.manager_id);
  select title into task_title from public.tasks where id = new.task_id;
  task_title := coalesce(task_title, new.title);
  new_due := nullif(new.details ->> 'new_due_at', '')::timestamptz;
  when_en := to_char(new_due at time zone 'Asia/Riyadh', 'Dy DD Mon, HH12:MI AM');
  when_ar := to_char(new_due at time zone 'Asia/Riyadh', 'DD/MM HH12:MI') ||
             case when extract(hour from new_due at time zone 'Asia/Riyadh') < 12 then ' ص' else ' م' end;

  insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    new.requested_by, 'request_answered', coalesce(new.resolved_by, new.manager_id), new.task_id,
    left(case
      when new.type = 'extension_request' and new.status = 'approved' and new_due is not null
        then format('✅ %s gave you more time: "%s"', who, task_title)
      when new.type = 'priority_question' and new.status = 'approved' then format('✅ %s took it back: "%s"', who, task_title)
      when new.status = 'approved' then format('✅ %s said yes: "%s"', who, task_title)
      else format('%s answered: "%s"', who, task_title) end, 200),
    case
      when new.type = 'extension_request' and new.status = 'approved' and new_due is not null
        then format('New due date: %s. I moved your reminders too 👍', when_en)
      when new.type = 'extension_request' then 'The date stays as it is. Need help to make it? Tell me and I’ll sort it.'
      when new.type = 'priority_question' and new.status = 'approved' then 'It’s off your list now. Focus on your other work 👍'
      when new.status = 'approved' then 'Go ahead as you asked. I’m with you.'
      else 'Not this time. Open it to see what to do next.' end,
    left(case
      when new.type = 'extension_request' and new.status = 'approved' and new_due is not null
        then format('✅ %s عطاك وقت زيادة: «%s»', who_ar, task_title)
      when new.type = 'priority_question' and new.status = 'approved' then format('✅ %s أخذها منك: «%s»', who_ar, task_title)
      when new.status = 'approved' then format('✅ %s وافق: «%s»', who_ar, task_title)
      else format('%s رد على طلبك: «%s»', who_ar, task_title) end, 200),
    case
      when new.type = 'extension_request' and new.status = 'approved' and new_due is not null
        then format('موعدها الجديد %s. وحرّكت تذكيراتك معه 👍', when_ar)
      when new.type = 'extension_request' then 'الموعد باقي مثل ما هو. تحتاج مساعدة تلحق؟ قل لي وأدبّرها.'
      when new.type = 'priority_question' and new.status = 'approved' then 'شلتها من قائمتك، ركّز على شغلك الثاني 👍'
      when new.status = 'approved' then 'كمّل مثل ما طلبت، وأنا معك.'
      else 'مو هالمرة. افتحها وشوف وش الخطوة الجاية.' end,
    'answer:' || new.id
  )
  on conflict (dedupe_key) do nothing;

  -- more time approved: the plan's still-waiting reminders move with the new date
  if new.type = 'extension_request' and new.status = 'approved' and new_due is not null and new.task_id is not null then
    update public.followups f
       set scheduled_at = f.scheduled_at + (new_due - t.due_before)
      from (select coalesce((new.details ->> 'old_due_at')::timestamptz, (select due_at from public.tasks where id = new.task_id)) as due_before) t
     where f.task_id = new.task_id and f.status = 'scheduled' and t.due_before is not null and new_due > t.due_before;
  end if;
  return new;
end;
$$;

