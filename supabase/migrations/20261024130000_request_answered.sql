-- The person who asked (more time, which task first, help) hears the answer right away, in one clear notification:
-- a new alert kind 'request_answered' (always pushed, like a decision). The generic "X: Approved …" change alert for
-- the same moment is skipped so they don't get two.
alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind in (
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
  'objective_achieved', 'objective_at_risk', 'objective_missed', 'changed_for_you',
  'task_assigned', 'new_submission', 'decision_waiting', 'no_reply', 'escalated', 'tool_sync', 'new_feature',
  'request_answered'
));

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
      when new.status = 'approved' then format('✅ %s said yes: "%s"', who, task_title)
      else format('%s answered: "%s"', who, task_title) end, 200),
    case
      when new.type = 'extension_request' and new.status = 'approved' and new_due is not null
        then format('New due date: %s. I moved your reminders too 👍', when_en)
      when new.type = 'extension_request' then 'The date stays as it is. Need help to make it? Tell me and I’ll sort it.'
      when new.status = 'approved' then 'Go ahead as you asked. I’m with you.'
      else 'Not this time. Open it to see what to do next.' end,
    left(case
      when new.type = 'extension_request' and new.status = 'approved' and new_due is not null
        then format('✅ %s عطاك وقت زيادة: «%s»', who_ar, task_title)
      when new.status = 'approved' then format('✅ %s وافق: «%s»', who_ar, task_title)
      else format('%s رد على طلبك: «%s»', who_ar, task_title) end, 200),
    case
      when new.type = 'extension_request' and new.status = 'approved' and new_due is not null
        then format('موعدها الجديد %s. وحرّكت تذكيراتك معه 👍', when_ar)
      when new.type = 'extension_request' then 'الموعد باقي مثل ما هو. تحتاج مساعدة تلحق؟ قل لي وأدبّرها.'
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

drop trigger if exists decisions_answered on public.decisions;
create trigger decisions_answered after update of status on public.decisions
  for each row execute function public.notify_request_answered();

-- the generic "X: Approved …" alert to the requester would repeat the answer above
create or replace function public.notify_subject_of_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text;
  who_ar text;
  task_title text;
begin
  if new.actor_type <> 'user' or new.actor_id is null or new.subject_id is null or new.subject_id = new.actor_id then
    return new;
  end if;
  if new.action in ('decision_approved', 'decision_declined') then
    return new;
  end if;
  select split_part(full_name, ' ', 1), split_part(coalesce(full_name_ar, full_name), ' ', 1)
    into who, who_ar from public.profiles where id = new.actor_id;

  if new.action = 'task_created' and new.task_id is not null then
    select title into task_title from public.tasks where id = new.task_id;
    insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
    values (
      new.subject_id, 'task_assigned', new.actor_id, new.task_id,
      left(format('%s assigned you: %s', coalesce(who, 'Someone'), coalesce(task_title, '')), 200),
      'Open it to see what is needed and when.',
      left(format('%s سند لك: %s', coalesce(who_ar, who, 'أحد'), coalesce(task_title, '')), 200),
      'افتحها تشوف المطلوب ومتى.',
      'change:' || new.id
    )
    on conflict (dedupe_key) do nothing;
    return new;
  end if;

  insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    new.subject_id, 'changed_for_you', new.actor_id, new.task_id,
    left(format('%s: %s', coalesce(who, 'Someone'), new.summary), 200),
    coalesce(new.reason, ''),
    left(format('%s: %s', coalesce(who_ar, who, 'أحد'), coalesce(new.summary_ar, new.summary)), 200),
    coalesce(new.reason, ''),
    'change:' || new.id
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
