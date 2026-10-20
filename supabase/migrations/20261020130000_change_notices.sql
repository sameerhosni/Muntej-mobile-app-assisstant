-- A manager (or anyone allowed) changes things for their team directly; the person it concerns just gets told.
-- Every activity_log row written by someone ELSE about you (your task's status, due date, owner, cancel; your
-- profile; a bulk change) becomes an alert in your Alerts screen ("Ahmed: Updated "SPL pitch deck"").
-- Also: bulk changes now log each task for its owner, and Undo withdraws review requests the change opened.

-- ─── alerts: new kind ─────────────────────────────────────────────────────────
alter table public.alerts drop constraint alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check
  check (kind in ('task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
                  'objective_achieved', 'objective_at_risk', 'objective_missed', 'changed_for_you'));

-- ─── activity_log → alert for the person it concerns ─────────────────────────
create or replace function public.notify_subject_of_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text;
  who_ar text;
begin
  if new.actor_type <> 'user' or new.actor_id is null or new.subject_id is null or new.subject_id = new.actor_id then
    return new;
  end if;
  select split_part(full_name, ' ', 1), split_part(coalesce(full_name_ar, full_name), ' ', 1)
    into who, who_ar from public.profiles where id = new.actor_id;
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

revoke all on function public.notify_subject_of_change() from public, anon, authenticated;

drop trigger if exists activity_notify_subject on public.activity_log;
create trigger activity_notify_subject after insert on public.activity_log
  for each row execute function public.notify_subject_of_change();

-- ─── reviews: a submitter may withdraw an undecided round (Undo) ─────────────
drop policy if exists reviews_delete_own_pending on public.reviews;
create policy reviews_delete_own_pending on public.reviews for delete to authenticated
  using (submitted_by = public.current_profile_id() and decision is null);

-- ─── bulk: log each task too (so its owner is told); the batch row still drives Undo ─
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
          new_status := public.set_task_status(tid, p_change ->> 'status', null, true);
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
      ok := ok || jsonb_build_object('id', tid, 'title', t.title, 'status', new_status, 'owner_id', t.owner_id);
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

-- ─── undo: also withdraw review rounds the change opened ─────────────────────
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
      if prev ->> 'status' <> 'submitted' then
        delete from public.reviews r
         where r.task_id = (item ->> 'task_id')::uuid and r.decision is null
           and r.submitted_by = me and r.created_at >= l.created_at - interval '5 seconds';
      end if;
    end if;
  end loop;

  update public.activity_log set undone_at = now() where id = p_log;
  insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, undoable)
  values ('user', me, me, 'tasks_change_undone', format('Undid a change on %s tasks', n), format('تراجعت عن تعديل %s مهام', n), false);
  return n;
end;
$$;
