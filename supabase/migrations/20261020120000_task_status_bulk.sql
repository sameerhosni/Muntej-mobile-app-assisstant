-- Status changes and bulk changes by chat, with a 5-minute Undo.
--   set_task_status   — "I finished it", "start it", "it's blocked", "reopen it".
--                       "done" closes the task for the person who assigned it or anyone above the owner (and for
--                       self-assigned tasks); when only the owner says it, it goes to review (submitted) instead.
--   bulk_update_tasks — one change (status / due / priority / owner / cancel / delete) on many tasks; each task is
--                       tried on its own, failures are reported, not fatal. One undoable activity_log row per batch.
--   undo_task_changes — puts the tasks of such a log row back (within 5 minutes, only by the person who did it).
-- All security invoker: the tasks policies decide who may change which task.

-- ─── set_task_status ──────────────────────────────────────────────────────────
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
      format('"%s": %s → %s', t.title, t.status, target),
      format('"%s": %s ← %s', t.title, target, t.status),
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

-- ─── bulk_update_tasks ────────────────────────────────────────────────────────
-- p_change: { kind: 'status', status: 'done'|'in_progress'|'blocked'|'reopen' }
--         | { kind: 'due', due_at } | { kind: 'priority', priority } | { kind: 'owner', owner_id }
--         | { kind: 'cancel' } | { kind: 'delete' }
-- Returns { log_id, ok: [{ id, title, status }], failed: [{ id, title, error }] }.
create or replace function public.bulk_update_tasks(p_ids uuid[], p_change jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  kind text := p_change ->> 'kind';
  tid uuid;
  t public.tasks;
  ok jsonb := '[]'::jsonb;
  failed jsonb := '[]'::jsonb;
  undo jsonb := '[]'::jsonb;
  new_status text;
  log_id uuid;
begin
  if kind not in ('status', 'due', 'priority', 'owner', 'cancel', 'delete') then
    raise exception 'Unknown change %', kind;
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'No tasks picked';
  end if;
  if array_length(p_ids, 1) > 100 then
    raise exception 'Too many tasks at once (max 100)';
  end if;

  foreach tid in array p_ids loop
    select * into t from public.tasks where id = tid;
    if not found then
      failed := failed || jsonb_build_object('id', tid, 'title', null, 'error', 'Task not found');
      continue;
    end if;
    begin
      new_status := t.status::text;
      case kind
        when 'status' then
          new_status := public.set_task_status(tid, p_change ->> 'status', null, false);
        when 'due' then
          perform public.update_task_from_chat(tid, jsonb_build_object('due_at', p_change ->> 'due_at'));
        when 'priority' then
          perform public.update_task_from_chat(tid, jsonb_build_object('priority', p_change ->> 'priority'));
        when 'owner' then
          perform public.update_task_from_chat(tid, jsonb_build_object('owner_id', p_change ->> 'owner_id'));
        when 'cancel' then
          perform public.cancel_task(tid);
          new_status := 'cancelled';
        when 'delete' then
          perform public.delete_task(tid);
          new_status := 'deleted';
      end case;
      ok := ok || jsonb_build_object('id', tid, 'title', t.title, 'status', new_status);
      if kind <> 'delete' then
        undo := undo || jsonb_build_object('task_id', tid, 'previous', jsonb_build_object(
          'status', t.status, 'closed_at', t.closed_at, 'progress', t.progress,
          'due_at', t.due_at, 'expected_close_at', t.expected_close_at, 'priority', t.priority, 'owner_id', t.owner_id));
      end if;
    exception when others then
      failed := failed || jsonb_build_object('id', tid, 'title', t.title, 'error', sqlerrm);
    end;
  end loop;

  if jsonb_array_length(ok) > 0 then
    insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, reason, undoable, undo_payload)
    values (
      'user', me, me, 'tasks_bulk_changed',
      format('Changed %s tasks at once (%s)', jsonb_array_length(ok), kind),
      format('عدّلت %s مهام مرة وحدة (%s)', jsonb_array_length(ok), kind),
      p_change::text,
      kind <> 'delete',
      case when kind <> 'delete' then jsonb_build_object('tasks', undo) else null end
    )
    returning id into log_id;
  end if;

  return jsonb_build_object('log_id', log_id, 'ok', ok, 'failed', failed);
end;
$$;

-- ─── undo_task_changes ────────────────────────────────────────────────────────
-- Puts back status / closed_at / progress (and due / priority / owner when recorded) for every task in the row.
create or replace function public.undo_task_changes(p_log uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  l public.activity_log;
  item jsonb;
  prev jsonb;
  n integer := 0;
begin
  select * into l from public.activity_log where id = p_log;
  if not found or l.actor_id is distinct from me then
    raise exception 'Nothing to undo';
  end if;
  if l.undone_at is not null then
    raise exception 'Already undone';
  end if;
  if not l.undoable or l.undo_payload is null or not (l.undo_payload ? 'tasks') then
    raise exception 'This change can''t be undone';
  end if;
  if l.created_at < now() - interval '5 minutes' then
    raise exception 'Too late to undo (5 minutes)';
  end if;

  for item in select * from jsonb_array_elements(l.undo_payload -> 'tasks') loop
    prev := item -> 'previous';
    update public.tasks t set
      status = (prev ->> 'status')::public.task_status,
      closed_at = nullif(prev ->> 'closed_at', '')::timestamptz,
      progress = coalesce((prev ->> 'progress')::smallint, t.progress),
      due_at = case when prev ? 'due_at' then nullif(prev ->> 'due_at', '')::timestamptz else t.due_at end,
      expected_close_at = case when prev ? 'expected_close_at' then nullif(prev ->> 'expected_close_at', '')::timestamptz else t.expected_close_at end,
      priority = case when prev ? 'priority' then (prev ->> 'priority')::public.task_priority else t.priority end,
      owner_id = case when prev ? 'owner_id' then nullif(prev ->> 'owner_id', '')::uuid else t.owner_id end
    where t.id = (item ->> 'task_id')::uuid;
    if found then
      n := n + 1;
    end if;
  end loop;

  update public.activity_log set undone_at = now() where id = p_log;
  insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, undoable)
  values ('user', me, me, 'tasks_change_undone', format('Undid a change on %s tasks', n), format('تراجعت عن تعديل %s مهام', n), false);
  return n;
end;
$$;

revoke all on function public.set_task_status(uuid, text, text, boolean) from public, anon;
revoke all on function public.bulk_update_tasks(uuid[], jsonb) from public, anon;
revoke all on function public.undo_task_changes(uuid) from public, anon;
grant execute on function public.set_task_status(uuid, text, text, boolean) to authenticated;
grant execute on function public.bulk_update_tasks(uuid[], jsonb) to authenticated;
grant execute on function public.undo_task_changes(uuid) to authenticated;

