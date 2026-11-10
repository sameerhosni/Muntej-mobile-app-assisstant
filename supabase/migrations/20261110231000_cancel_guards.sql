-- Reviewer, 10 Nov (quick cancel, pass 2): an old button (a WhatsApp tap, a «يحتاجك» row) checks the task again.
--   cancel_task refuses a task that's already done («خلصت أصلاً»); keep_task refuses a closed one
--   a task that closes (done or cancelled, any path) settles its cancel requests: they leave «يحتاجك»
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
  settled uuid[];
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    raise exception 'Task not found';
  end if;
  if t.status = 'cancelled' then
    return; -- already cancelled (a second tap): nothing to do
  end if;
  if t.status = 'done' then
    raise exception 'Already done: nothing to cancel. خلصت أصلاً، ما فيه شي ينلغي.';
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
  select coalesce(array_agg(id), '{}') into settled from public.decisions where task_id = p_task and status = 'pending';
  perform public.settle_cancelled_task(p_task, me);

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable, undo_payload)
  values ('user', me, coalesce(t.owner_id, me), p_task, 'task_cancelled',
          format('Cancelled "%s"', t.title), format('ألغيت "%s"', t.title), true,
          jsonb_build_object('restore', jsonb_build_object('status', t.status, 'followups', to_jsonb(stopped), 'decisions', to_jsonb(settled))));
end;
$$;

create or replace function public.keep_task(p_task uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
  a record;
  who text;
  who_ar text;
  n integer := 0;
begin
  select * into t from public.tasks where id = p_task;
  if not found or me is null or not public.can_cancel_task(p_task) then
    raise exception 'Only the person who gave this task can decide. القرار لللي عطاها.';
  end if;
  if t.status in ('cancelled', 'done') then
    raise exception 'This task is already closed. المهمة مقفلة.';
  end if;
  select split_part(full_name, ' ', 1), split_part(coalesce(full_name_ar, full_name), ' ', 1)
    into who, who_ar from public.profiles where id = me;
  for a in update public.alerts set read_at = now()
            where task_id = p_task and kind = 'cancel_asked' and profile_id = me and read_at is null returning id, subject_id loop
    n := n + 1;
    if a.subject_id is not null then
      insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
      values (a.subject_id, 'request_answered', me, p_task,
              left(format('%s kept "%s" — carry on with it', coalesce(who, 'Someone'), t.title), 200), '',
              left(format('%s خلّى «%s» — كمّل عليها', coalesce(who_ar, who, 'أحد'), t.title), 200), '',
              'cancel_kept:' || a.id)
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;
  if n > 0 then
    insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
    values ('user', me, coalesce(t.owner_id, me), p_task, 'cancel_kept',
            format('Kept "%s"', t.title), format('خلّيت "%s"', t.title), false);
  end if;
  return n;
end;
$$;

-- a closed task has nothing left to cancel: its requests leave the giver's list, whatever closed it
create or replace function public.settle_cancel_asks_on_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('done', 'cancelled') and old.status is distinct from new.status then
    update public.alerts set read_at = now() where task_id = new.id and kind = 'cancel_asked' and read_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists settle_cancel_asks_on_close on public.tasks;
create trigger settle_cancel_asks_on_close after update of status on public.tasks
  for each row execute function public.settle_cancel_asks_on_close();
