-- The owner, 10 Nov: "Already deleted but still there. Let's add delete or cancel button with each task for easier and
-- quick update" (option 1: ask «تلغيها؟» first, then «رجّعها» for 6 seconds). Cancel stays the only way (no hard delete):
--   cancel_task   remembers what it stopped (the status and the scheduled follow-ups) so it can be brought back
--   restore_task  «رجّعها»: whoever may cancel it brings it back as it was, follow-ups still ahead scheduled again
--   ask_to_cancel the doer of a task someone else gave: asks the giver to cancel it (an alert, the giver decides)
--   the doer's notice reads «أحمد ألغى «X» — ما عاد تحتاج تسويها» (not «أحمد: ألغيت …», which read as "I cancelled")

create or replace function public.cancel_task(p_task uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
  stopped uuid[];
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    raise exception 'Task not found';
  end if;
  if t.status = 'cancelled' then
    return; -- already cancelled (a second tap): nothing to do
  end if;
  if not public.can_cancel_task(p_task) then
    raise exception 'Only the person who gave this task (or their manager) can cancel it. ما يلغيها إلا اللي عطاك إياها أو مديره.';
  end if;

  update public.tasks set status = 'cancelled' where id = p_task;
  if not found then
    raise exception 'Not allowed to cancel this task';
  end if;
  with s as (
    update public.followups set status = 'cancelled' where task_id = p_task and status = 'scheduled' returning id
  )
  select coalesce(array_agg(id), '{}') into stopped from s;

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable, undo_payload)
  values ('user', me, coalesce(t.owner_id, me), p_task, 'task_cancelled',
          format('Cancelled "%s"', t.title), format('ألغيت "%s"', t.title), true,
          jsonb_build_object('restore', jsonb_build_object('status', t.status, 'followups', to_jsonb(stopped))));
end;
$$;

create or replace function public.restore_task(p_task uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
  l public.activity_log;
  back text;
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    raise exception 'Task not found';
  end if;
  if t.status <> 'cancelled' then
    return t.status::text; -- already back
  end if;
  if not public.can_cancel_task(p_task) then
    raise exception 'Only the person who gave this task (or their manager) can bring it back. ما يرجّعها إلا اللي عطاك إياها أو مديره.';
  end if;
  select * into l from public.activity_log
   where task_id = p_task and action = 'task_cancelled' and undone_at is null
   order by created_at desc limit 1;
  -- cancelled before this change (nothing remembered): back as given, its owner works on it again
  back := coalesce(l.undo_payload -> 'restore' ->> 'status', 'assigned');
  if back in ('cancelled', 'done') then back := 'assigned'; end if;

  update public.tasks set status = back::public.task_status, closed_at = null where id = p_task;
  if l.id is not null then
    update public.followups set status = 'scheduled'
     where task_id = p_task and status = 'cancelled' and scheduled_at > now()
       and id in (select (jsonb_array_elements_text(coalesce(l.undo_payload -> 'restore' -> 'followups', '[]'::jsonb)))::uuid);
    update public.activity_log set undone_at = now() where id = l.id;
  end if;

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
  values ('user', me, coalesce(t.owner_id, me), p_task, 'task_restored',
          format('Brought back "%s"', t.title), format('رجّعت "%s"', t.title), false);
  return back;
end;
$$;
revoke all on function public.restore_task(uuid) from public, anon;
grant execute on function public.restore_task(uuid) to authenticated;

-- the doer of a task someone else gave: "no need for it any more, cancel it?" → the giver (or, with nobody, the manager)
create or replace function public.ask_to_cancel(p_task uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
  giver uuid;
  who text;
  who_ar text;
  why text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
begin
  select * into t from public.tasks where id = p_task;
  if not found or me is null or not (t.owner_id = me or t.helper_id = me) then
    raise exception 'Only the person doing this task can ask to cancel it';
  end if;
  if t.status in ('cancelled', 'done') then
    raise exception 'This task is already closed. المهمة مقفلة.';
  end if;
  giver := case when t.assigner_id is not null and t.assigner_id <> me then t.assigner_id
                else (select manager_id from public.profiles where id = me) end;
  if giver is null then
    raise exception 'Nobody else gave this task: you can cancel it yourself. ما أحد عطاك إياها، تقدر تلغيها بنفسك.';
  end if;
  select split_part(full_name, ' ', 1), split_part(coalesce(full_name_ar, full_name), ' ', 1)
    into who, who_ar from public.profiles where id = me;

  insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    giver, 'changed_for_you', me, p_task,
    left(format('%s says "%s" isn''t needed any more — cancel it?', coalesce(who, 'Someone'), t.title), 200),
    coalesce(why, 'Open it and tap Cancel, or keep it.'),
    left(format('%s يقول «%s» ما عاد لها داعي — تلغيها؟', coalesce(who_ar, who, 'أحد'), t.title), 200),
    coalesce(why, 'افتحها واضغط «ألغها»، أو خلّها.'),
    'cancel_ask:' || p_task || ':' || to_char(now(), 'YYYYMMDDHH24MI')
  )
  on conflict (dedupe_key) do nothing;

  -- its own clear alert above: the change notice skips this one
  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, reason, undoable)
  values ('user', me, giver, p_task, 'cancel_asked',
          format('Asked to cancel "%s"', t.title), format('طلبت إلغاء "%s"', t.title), why, false);
  return giver;
end;
$$;
revoke all on function public.ask_to_cancel(uuid, text) from public, anon;
grant execute on function public.ask_to_cancel(uuid, text) to authenticated;

-- the notice to the other side: who cancelled / brought it back, in words that can't read as "I cancelled"
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
  said text;
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
  if new.action in ('detail_asked', 'detail_answered', 'task_comment', 'more_time_asked', 'approval_asked', 'kudos_sent', 'busy_taken_back', 'person_renamed', 'closed_already_done', 'cancel_asked') then
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

  if new.action in ('task_cancelled', 'task_restored') and new.task_id is not null then
    select title into task_title from public.tasks where id = new.task_id;
    insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
    values (
      new.subject_id, 'changed_for_you', new.actor_id, new.task_id,
      left(case when new.action = 'task_cancelled'
                then format('%s cancelled "%s" — no need to do it', coalesce(who, 'Someone'), coalesce(task_title, ''))
                else format('%s brought back "%s" — it''s on your list again', coalesce(who, 'Someone'), coalesce(task_title, '')) end, 200),
      '',
      left(case when new.action = 'task_cancelled'
                then format('%s ألغى «%s» — ما عاد تحتاج تسويها', coalesce(who_ar, who, 'أحد'), coalesce(task_title, ''))
                else format('%s رجّع «%s» — رجعت في قائمتك', coalesce(who_ar, who, 'أحد'), coalesce(task_title, '')) end, 200),
      '',
      'change:' || new.id
    )
    on conflict (dedupe_key) do nothing;
    return new;
  end if;

  -- only the person's own words (what they wrote when sending it back) go to the other side
  said := case when new.action = 'sent_back' then coalesce(new.reason, '') else '' end;
  insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    new.subject_id, 'changed_for_you', new.actor_id, new.task_id,
    left(format('%s: %s', coalesce(who, 'Someone'), new.summary), 200),
    said,
    left(format('%s: %s', coalesce(who_ar, who, 'أحد'), coalesce(new.summary_ar, new.summary)), 200),
    said,
    'change:' || new.id
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
