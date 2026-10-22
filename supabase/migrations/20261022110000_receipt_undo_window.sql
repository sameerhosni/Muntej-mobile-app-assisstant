-- Receipt + undo window (BRD v1.2 FR-CAP-06/07): after a task is created the creator has 10 seconds to Undo, and the
-- owner hears nothing until that window closes. If it is undone in time, the owner is never told at all.

-- the owner's "X gave you a task" push waits out the undo window (send-followups delivers it on its next minute run)
create or replace function public.hold_new_task_alert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'task_assigned' and new.deliver_after is null then
    new.deliver_after := now() + interval '10 seconds';
  end if;
  return new;
end;
$$;

drop trigger if exists hold_new_task_alert on public.alerts;
create trigger hold_new_task_alert before insert on public.alerts for each row execute function public.hold_new_task_alert();

-- the first follow-up ("here's your new task") also waits out the window
create or replace function public.hold_first_followup()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.scheduled_at < now() + interval '10 seconds' then
    new.scheduled_at := now() + interval '10 seconds';
  end if;
  return new;
end;
$$;

drop trigger if exists hold_first_followup on public.followups;
create trigger hold_first_followup before insert on public.followups for each row execute function public.hold_first_followup();

-- Undo on a fresh task card: cancel it (nothing is deleted), stop its follow-ups, and when the owner hasn't been told
-- yet, drop the waiting notices so they never hear about it (and log the undo for the creator only).
create or replace function public.undo_chat_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
  silent boolean;
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    raise exception 'Task not found';
  end if;
  if t.assigner_id is distinct from me and t.owner_id is distinct from me then
    raise exception 'Only the person who created this task can undo it';
  end if;

  -- the owner hasn't been told yet: nothing of it was delivered
  silent := not exists (select 1 from public.alerts a where a.task_id = p_task and a.delivered_at is not null and a.profile_id <> me);

  update public.tasks set status = 'cancelled' where id = p_task;
  update public.followups set status = 'cancelled' where task_id = p_task and status = 'scheduled';
  if silent then
    -- unsent notices about a task that no longer exists for them
    delete from public.alerts where task_id = p_task and delivered_at is null and profile_id <> me;
  end if;
  update public.activity_log set undone_at = now()
    where task_id = p_task and action = 'task_created' and undone_at is null;

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
  values ('user', me, case when silent then me else coalesce(t.owner_id, me) end, p_task, 'task_undone',
          format('Undid "%s"', t.title), format('تراجعت عن "%s"', t.title), false);
end;
$$;

revoke all on function public.undo_chat_task(uuid) from public, anon;
grant execute on function public.undo_chat_task(uuid) to authenticated;
