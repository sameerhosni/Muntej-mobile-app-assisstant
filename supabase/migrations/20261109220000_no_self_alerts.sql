-- N11 (owner, 9 Nov): "I get notifications for actions I did as well". No alert to another seat of the same login, and
-- no generic "changed for you" when the action already sends its own alert (asked about a detail, comment, more time, approval,
-- thanks, busy taken back, rename).

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
  -- the same login in another company seat is still you (Nouran, 9 Nov: "I get notifications for actions I did")
  if exists (select 1 from public.profiles a join public.profiles s on s.user_id = a.user_id
             where a.id = new.actor_id and s.id = new.subject_id and a.user_id is not null) then
    return new;
  end if;
  -- these already send their own, clearer alert: one is enough
  if new.action in ('detail_asked', 'task_comment', 'more_time_asked', 'approval_asked', 'kudos_sent', 'busy_taken_back', 'person_renamed') then
    return new;
  end if;  if new.action in ('decision_approved', 'decision_declined') then
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
