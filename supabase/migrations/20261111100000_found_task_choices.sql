-- The owner, 11 Nov (option B): a found task's full card and every choice (give it to someone, already done, change the
-- date, full message, undo). Reviewer, pass 1:
--   assignable_for     WhatsApp acts with the service role: who this seat may give work to, by the same rule as the app
--                      (can_assign_to), never the whole company
--   undo_found_task    «↩️ تراجع» only undoes its own tap: the task this seat made from a found task in the last 5 minutes,
--                      that nobody has touched since; the doer is told the normal way. Anything else: «مشت من بعدها»
--   found_task_choices testers first (Saree3 announces it)

create or replace function public.assignable_for(p_actor uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p, public.profiles a
   where a.id = p_actor and p.account_id = a.account_id and p.status <> 'deleted' and not coalesce(p.hidden, false)
     and p.role <> 'super_admin'
     and (
          p.id = a.id
       or not public.feature_on_for('assign_rules', a.id)
       or a.role in ('admin', 'super_admin')
       or public.is_below(p.id, a.id)
       or public.org_depth(p.id) = public.org_depth(a.id)
     );
$$;
revoke all on function public.assignable_for(uuid) from public, anon, authenticated;

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
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    raise exception 'Task not found';
  end if;
  if t.status = 'cancelled' then
    return 'cancelled';
  end if;
  -- this seat's own tap made it (approved from a found task, or «خلصتها قبل»)
  select * into l from public.activity_log
   where task_id = p_task and actor_id = p_actor and action in ('task_created', 'task_done_before')
   order by created_at desc limit 1;
  if not found then
    raise exception 'moved_on: not made by this tap. مشت من بعدها';
  end if;
  if l.created_at < now() - interval '5 minutes' then
    raise exception 'moved_on: too late to undo (5 minutes). مشت من بعدها';
  end if;
  before_done := exists (select 1 from public.activity_log where task_id = p_task and actor_id = p_actor and action = 'task_done_before');
  -- nobody acted on it since: no one else's change, no proof, no review round of the doer's
  if exists (select 1 from public.activity_log where task_id = p_task and actor_type = 'user' and actor_id is distinct from p_actor)
     or exists (select 1 from public.evidence where task_id = p_task)
     or (not before_done and exists (select 1 from public.reviews where task_id = p_task))
     or (before_done and t.status not in ('done', 'submitted'))
     or (not before_done and (t.status not in ('draft', 'assigned') or coalesce(t.progress, 0) > 0)) then
    raise exception 'moved_on: someone acted on it since. مشت من بعدها';
  end if;

  update public.tasks set status = 'cancelled' where id = p_task;
  update public.followups set status = 'cancelled' where task_id = p_task and status = 'scheduled';
  delete from public.reviews where task_id = p_task and decision is null and submitted_by = p_actor;
  -- the doer hears it the normal way (notify_subject_of_change: «… ألغى «X» — ما عاد تحتاج تسويها»)
  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
  values ('user', p_actor, coalesce(t.owner_id, p_actor), p_task, 'task_cancelled',
          format('Took back "%s" (undo)', t.title), format('تراجعت عن «%s»', t.title), false);
  return 'undone';
end;
$$;
revoke all on function public.undo_found_core(uuid, uuid) from public, anon, authenticated;

-- the app's «رجّعها» (as the signed-in seat)
create or replace function public.undo_found_task(p_task uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select public.undo_found_core(p_task, public.current_profile_id());
$$;
revoke all on function public.undo_found_task(uuid) from public, anon;
grant execute on function public.undo_found_task(uuid) to authenticated;

insert into public.features (key, audience, released_at, testing, title, title_ar, benefit, benefit_ar, sort) values
  ('found_task_choices', 'all', now(), true, 'See a found task in full before you decide',
   'شوف المهمة كاملة قبل ما تقرر',
   'Tasks Muntej finds in your mail and chats now show everything: what''s needed, when it''s done, due and for whom. Approve it for you or someone else, mark it already done, change its date or read the full message, and undo any of it.',
   'المهام اللي يلقاها منتج في إيميلك ومحادثاتك صارت تبيّن كل شي: المطلوب، متى تنتهي، الموعد، ولمين. اعتمدها لك أو لغيرك، أو علّمها خلصت قبل، أو غيّر موعدها، أو اقرأ الرسالة كاملة، وتقدر تتراجع عن أي شي.', -27)
on conflict (key) do nothing;
