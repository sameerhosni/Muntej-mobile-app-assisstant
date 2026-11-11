-- Reviewer, 11 Nov (found-task choices, pass 2): a login with two company seats couldn't use «خلصتها قبل» or «↩️ تراجع»
-- on WhatsApp for the seat that owns the item. create_task_as / the user session act as the seat the person last opened
-- in the app (account_sessions), not the one the item belongs to.
--   current_account_id  honours a transaction-local "acting account" (muntej.acting_account), only when the signed-in
--                       login has a seat there (no one can act in an account they're not in)
--   create_task_as      acts in the actor's own account
--   set_task_status_as  the same, for closing a task (service role only)
--   undo_found_core     the tap's log row may be written by any seat of the same login

create or replace function public.current_account_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.account_id from public.profiles p
      where p.user_id = (select auth.uid()) and p.status <> 'deleted'
        and p.account_id = nullif(current_setting('muntej.acting_account', true), '')::uuid
      limit 1),
    (select s.account_id from public.account_sessions s
      where s.user_id = (select auth.uid())
        and exists (select 1 from public.profiles p where p.user_id = s.user_id and p.account_id = s.account_id and p.status <> 'deleted')),
    (select p.account_id from public.profiles p
      where p.user_id = (select auth.uid()) and p.status <> 'deleted'
      order by p.hidden, p.created_at limit 1)
  );
$$;

create or replace function public.create_task_as(p jsonb, actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  acct uuid;
begin
  select user_id, account_id into uid, acct from public.profiles where id = actor;
  if uid is null then
    raise exception 'No signed-in user behind this profile';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  -- as THIS seat, whichever company the person last opened in the app
  perform set_config('muntej.acting_account', acct::text, true);
  return public.create_task_with_plan(p);
end;
$$;

create or replace function public.set_task_status_as(p_task uuid, p_status text, p_actor uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  acct uuid;
begin
  select user_id, account_id into uid, acct from public.profiles where id = p_actor;
  if uid is null then
    raise exception 'No signed-in user behind this profile';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('muntej.acting_account', acct::text, true);
  return public.set_task_status(p_task, p_status);
end;
$$;
revoke all on function public.set_task_status_as(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.undo_found_core(p_task uuid, p_actor uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  l public.activity_log;
  before_done boolean;
  mine uuid[];
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    raise exception 'Task not found';
  end if;
  if t.status = 'cancelled' then
    return 'cancelled';
  end if;
  -- every seat of the same login counts as this tap's author
  select coalesce(array_agg(id), array[p_actor]) into mine from public.profiles
   where user_id is not null and user_id = (select user_id from public.profiles where id = p_actor);
  if not p_actor = any(mine) then mine := mine || p_actor; end if;
  select * into l from public.activity_log
   where task_id = p_task and actor_id = any(mine) and action in ('task_created', 'task_done_before')
   order by created_at desc limit 1;
  if not found then
    raise exception 'moved_on: not made by this tap. مشت من بعدها';
  end if;
  if l.created_at < now() - interval '5 minutes' then
    raise exception 'moved_on: too late to undo (5 minutes). مشت من بعدها';
  end if;
  before_done := exists (select 1 from public.activity_log where task_id = p_task and actor_id = any(mine) and action = 'task_done_before');
  if exists (select 1 from public.activity_log where task_id = p_task and actor_type = 'user' and not (actor_id = any(mine)))
     or exists (select 1 from public.evidence where task_id = p_task)
     or (not before_done and exists (select 1 from public.reviews where task_id = p_task))
     or (before_done and t.status not in ('done', 'submitted'))
     or (not before_done and (t.status not in ('draft', 'assigned') or coalesce(t.progress, 0) > 0)) then
    raise exception 'moved_on: someone acted on it since. مشت من بعدها';
  end if;

  update public.tasks set status = 'cancelled' where id = p_task;
  update public.followups set status = 'cancelled' where task_id = p_task and status = 'scheduled';
  delete from public.reviews where task_id = p_task and decision is null and submitted_by = any(mine);
  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
  values ('user', p_actor, coalesce(t.owner_id, p_actor), p_task, 'task_cancelled',
          format('Took back "%s" (undo)', t.title), format('تراجعت عن «%s»', t.title), false);
  return 'undone';
end;
$$;
revoke all on function public.undo_found_core(uuid, uuid) from public, anon, authenticated;
