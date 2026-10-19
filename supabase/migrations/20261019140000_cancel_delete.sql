-- Tasks are cancelled or deleted (no "undo"): cancel keeps the task as cancelled, delete removes it.

-- chat card states
alter table public.chat_messages drop constraint chat_messages_action_check;
update public.chat_messages set action = 'cancelled' where action = 'undone';
alter table public.chat_messages add constraint chat_messages_action_check
  check (action in ('none', 'created', 'updated', 'cancelled', 'deleted'));

drop function if exists public.undo_chat_task(uuid);

-- ─── cancel_task ──────────────────────────────────────────────────────────────
-- security invoker → tasks_update decides who may (owner, assigner or the owner's manager).
create or replace function public.cancel_task(p_task uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    raise exception 'Task not found';
  end if;

  update public.tasks set status = 'cancelled' where id = p_task;
  if not found then
    raise exception 'Not allowed to cancel this task';
  end if;
  update public.followups set status = 'cancelled' where task_id = p_task and status = 'scheduled';

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
  values ('user', me, coalesce(t.owner_id, me), p_task, 'task_cancelled',
          format('Cancelled "%s"', t.title), format('ألغيت "%s"', t.title), false);
end;
$$;

-- ─── delete_task ──────────────────────────────────────────────────────────────
-- security invoker → tasks_delete decides who may (the assigner or the owner's manager).
-- The log row is written without task_id so it survives the delete (task children cascade away).
create or replace function public.delete_task(p_task uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    raise exception 'Task not found';
  end if;

  delete from public.tasks where id = p_task;
  if not found then
    raise exception 'Only the person who assigned this task (or the owner''s manager) can delete it';
  end if;

  insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, reason, undoable)
  values ('user', me, coalesce(t.owner_id, me), 'task_deleted',
          format('Deleted "%s"', t.title), format('حذفت "%s"', t.title), format('Task id %s', p_task), false);
end;
$$;

revoke all on function public.cancel_task(uuid) from public, anon;
revoke all on function public.delete_task(uuid) from public, anon;
grant execute on function public.cancel_task(uuid) to authenticated;
grant execute on function public.delete_task(uuid) to authenticated;
