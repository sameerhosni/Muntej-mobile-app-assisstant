-- The owner, 9 Nov: "I should not be able to cancel a task I didn't create" and "what is the difference between cancel
-- and delete anyways? let's make it only one option". One option, Cancel (the task stays in the record, follow-ups
-- stop), for the person who gave the task, anyone above its owner, or an admin. The owner of a task they were given
-- can no longer cancel it.

create or replace function public.can_cancel_task(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
     where t.id = p_task
       and public.same_account(coalesce(t.assigner_id, t.owner_id))
       and (
         t.assigner_id = public.current_profile_id()
         or public.is_admin()
         or public.is_super_admin()
         or (t.owner_id is not null and public.is_below(t.owner_id, public.current_profile_id()))
         -- a task you made for yourself with nobody else giving it
         or (t.assigner_id is null and t.owner_id = public.current_profile_id())
       )
  );
$$;
revoke all on function public.can_cancel_task(uuid) from public, anon;
grant execute on function public.can_cancel_task(uuid) to authenticated;

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
  if not public.can_cancel_task(p_task) then
    raise exception 'Only the person who gave this task (or their manager) can cancel it. ما يلغيها إلا اللي عطاك إياها أو مديره.';
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
