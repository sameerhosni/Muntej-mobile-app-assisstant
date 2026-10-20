-- Human wording for status changes in activity_log (and so in the Alerts the person gets):
-- "Ahmed: Closed "SPL pitch deck"" instead of "in_progress → done". Same function otherwise.
create or replace function public.set_task_status(p_task uuid, p_status text, p_note text default null, p_log boolean default true)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
  can_close boolean;
  target public.task_status;
  reviewer uuid;
  next_round smallint;
  log_id uuid;
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    raise exception 'Task not found';
  end if;
  if t.status = 'cancelled' then
    raise exception 'This task is cancelled';
  end if;

  can_close := t.assigner_id = me or public.is_manager_of(t.owner_id) or (t.owner_id = me and t.assigner_id = me);

  target := case p_status
    when 'done' then (case when can_close then 'done' else 'submitted' end)::public.task_status
    when 'in_progress' then 'in_progress'::public.task_status
    when 'blocked' then 'blocked'::public.task_status
    -- reopen: back to work (owner) or back to assigned (nobody owns it yet)
    when 'reopen' then (case when t.owner_id is null then 'draft' else 'in_progress' end)::public.task_status
    when 'returned' then 'returned'::public.task_status
    else null
  end;
  if target is null then
    raise exception 'Unknown status %', p_status;
  end if;
  if target = 'submitted' and t.owner_id is distinct from me then
    raise exception 'Only the owner, the person who assigned it or their manager can mark this task done';
  end if;
  if target = 'returned' and not can_close then
    raise exception 'Only the person who assigned it or the owner''s manager can send it back';
  end if;
  if target = t.status then
    return target::text;
  end if;

  update public.tasks set
    status = target,
    closed_at = case when target = 'done' then now() else null end,
    progress = case when target = 'done' then 100 when target = 'submitted' then greatest(progress, 90) else progress end
  where id = p_task;
  if not found then
    raise exception 'Not allowed to change this task';
  end if;

  -- nothing left to chase once it is closed or waiting for review
  if target in ('done', 'submitted') then
    update public.followups set status = 'cancelled' where task_id = p_task and status = 'scheduled';
  end if;

  -- submitted → a review round for the assigner (or the owner's manager when they assigned it to themselves)
  if target = 'submitted' then
    reviewer := case when t.assigner_id <> me then t.assigner_id
                     else (select manager_id from public.profiles where id = me) end;
    select coalesce(max(round), 0) + 1 into next_round from public.reviews where task_id = p_task;
    insert into public.reviews (task_id, round, submitted_by, submission_note, reviewer_id)
    values (p_task, next_round, me, nullif(trim(coalesce(p_note, '')), ''), reviewer);
  end if;

  -- a manager approving a waiting review closes that round
  if target = 'done' and t.status = 'submitted' then
    update public.reviews set decision = 'approved', decided_at = now(), reviewer_id = coalesce(reviewer_id, me)
    where task_id = p_task and decision is null;
  end if;
  if target = 'returned' then
    update public.reviews set decision = 'sent_back', decided_at = now(), reviewer_id = coalesce(reviewer_id, me),
      note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note)
    where task_id = p_task and decision is null;
  end if;

  if p_log then
    insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, reason, undoable, undo_payload)
    values (
      'user', me, coalesce(t.owner_id, me), p_task, 'task_status_changed',
      format(case target
        when 'done' then 'Closed "%s"'
        when 'submitted' then 'Sent "%s" for review'
        when 'blocked' then 'Marked "%s" blocked'
        when 'returned' then 'Sent "%s" back for changes'
        else 'Marked "%s" in progress' end, t.title),
      format(case target
        when 'done' then 'قفل «%s»'
        when 'submitted' then 'أرسل «%s» للمراجعة'
        when 'blocked' then 'علّم «%s» إنها واقفة'
        when 'returned' then 'رجّع «%s» للتعديل'
        else 'حط «%s» قيد التنفيذ' end, t.title),
      nullif(trim(coalesce(p_note, '')), ''),
      true,
      jsonb_build_object('tasks', jsonb_build_array(jsonb_build_object(
        'task_id', p_task,
        'previous', jsonb_build_object('status', t.status, 'closed_at', t.closed_at, 'progress', t.progress)
      )))
    )
    returning id into log_id;
  end if;

  return target::text;
end;
$$;
