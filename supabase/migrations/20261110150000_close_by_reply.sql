-- Reviewer, 10 Nov (R105): a task closed because the conversation shows it's already handled (Nouran: "auto cancel the
-- task if the user responded already") must close the way a person's tap does, and be undoable by that person.
-- close_by_reply (service role only, called by the tools reader):
--   * only the person's own work (or work that closes by itself): someone else's still goes through their review
--   * the task's other pending decisions are resolved, its reminders stop
--   * logged as Muntej's action FOR the owner (actor_id = owner, so they may undo it), undoable for 7 days
--   * the owner is told, in one clear line, what was closed and why
create or replace function public.close_by_reply(p_task uuid, p_profile uuid, p_why text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  to_status public.task_status;
begin
  select * into t from public.tasks where id = p_task;
  if t.id is null or t.owner_id is distinct from p_profile then return 'not_theirs'; end if;
  if t.status not in ('assigned', 'in_progress', 'blocked', 'returned') then return t.status::text; end if;
  -- work someone else gave goes through their review: a reply in a chat doesn't skip it, so it stays for the person
  if not (t.assigner_id is null or t.assigner_id = t.owner_id or coalesce(t.closes_itself, false)) then return 'needs_review'; end if;
  to_status := 'done';

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, reason, undoable, undo_payload)
  values ('muntej', p_profile, p_profile, t.id, 'closed_by_reply',
          format('Closed "%s": the conversation shows it''s already handled', t.title),
          format('قفّلت «%s»: المحادثة تقول إنها انتهت', t.title),
          left(coalesce(p_why, ''), 300), true,
          jsonb_build_object('tasks', jsonb_build_array(jsonb_build_object('task_id', t.id, 'previous',
            jsonb_build_object('status', t.status, 'progress', t.progress, 'closed_at', coalesce(t.closed_at::text, ''))))));

  update public.tasks
     set status = to_status, progress = 100, closed_at = now()
   where id = t.id;
  update public.followups set status = 'cancelled' where task_id = t.id and status = 'scheduled';
  -- nothing left to decide on a finished task (R94)
  update public.decisions set status = 'finished', resolved_by = p_profile, resolved_at = now()
   where task_id = t.id and status = 'pending';

  insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
  values (p_profile, 'changed_for_you', null, t.id,
          left(format('Closed "%s": you already handled it', t.title), 200),
          'From your conversation. Not right? Open it and reopen.',
          left(format('قفّلت «%s»: خلّصتها في المحادثة', t.title), 200),
          'من محادثتك. مو صحيح؟ افتحها ورجّعها.',
          'closed_by_reply:' || t.id)
  on conflict (dedupe_key) do nothing;
  return to_status::text;
end;
$$;
revoke all on function public.close_by_reply(uuid, uuid, text) from public, anon, authenticated;

-- undo: a reply-close can be undone by its owner for 7 days (other changes keep their 5 minutes)
do $do$
declare
  def text := pg_get_functiondef('public.undo_task_changes'::regproc);
  patched text;
begin
  patched := replace(def, $$if l.created_at < now() - interval '5 minutes' then$$,
                     $$if l.created_at < now() - (interval '5 minutes' + (l.action = 'closed_by_reply')::int * interval '7 days') then$$);
  if patched = def and position('closed_by_reply' in def) = 0 then
    raise exception 'undo_task_changes changed shape: patch it by hand';
  end if;
  execute patched;
end;
$do$;
