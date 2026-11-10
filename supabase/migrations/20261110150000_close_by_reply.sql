-- Reviewer, 10 Nov (R105): a task closed because the conversation shows it's already handled (Nouran: "auto cancel the
-- task if the user responded already") must close the way a person's tap does, and be undoable by that person.
-- close_by_reply (service role only, called by the tools reader):
--   * the same close-or-review rule as Done (set_task_status's can_close, for the owner): closes when they could close
--     it with one tap; otherwise it goes for review like Done does (a review round for the giver / their manager)
--   * reminders stop; a closed task's other pending decisions are resolved (R94)
--   * logged as Muntej's action FOR the owner (actor_id = owner, so they may undo it), undoable for 7 days
--   * the owner is told, in one clear line, what happened and why
create or replace function public.close_by_reply(p_task uuid, p_profile uuid, p_why text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  o public.profiles;
  can_close boolean;
  to_status public.task_status;
  reviewer uuid;
  next_round integer;
begin
  select * into t from public.tasks where id = p_task;
  if t.id is null or t.owner_id is distinct from p_profile then return 'not_theirs'; end if;
  if t.status not in ('assigned', 'in_progress', 'blocked', 'returned') then return t.status::text; end if;
  select * into o from public.profiles where id = p_profile;
  -- set_task_status's rule for the owner tapping Done (20261109230000_close_when_above_giver.sql)
  can_close := coalesce(t.closes_itself, false)
    or o.role in ('admin', 'super_admin')
    or ((t.assigner_id is null or t.assigner_id = p_profile) and o.manager_id is null)
    or (t.assigner_id is not null and t.assigner_id <> p_profile and public.is_below(t.assigner_id, p_profile));
  to_status := case when can_close then 'done' else 'submitted' end;

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, reason, undoable, undo_payload)
  values ('muntej', p_profile, p_profile, t.id, 'closed_by_reply',
          case when can_close then format('Closed "%s": the conversation shows it''s already handled', t.title)
               else format('Sent "%s" for review: the conversation shows it''s already handled', t.title) end,
          case when can_close then format('قفّلت «%s»: المحادثة تقول إنها انتهت', t.title)
               else format('أرسلت «%s» للمراجعة: المحادثة تقول إنها انتهت', t.title) end,
          left(coalesce(p_why, ''), 300), true,
          jsonb_build_object('tasks', jsonb_build_array(jsonb_build_object('task_id', t.id, 'previous',
            jsonb_build_object('status', t.status, 'progress', t.progress, 'closed_at', coalesce(t.closed_at::text, ''))))));

  update public.tasks
     set status = to_status,
         progress = case when can_close then 100 else greatest(progress, 90) end,
         closed_at = case when can_close then now() else null end
   where id = t.id;
  update public.followups set status = 'cancelled' where task_id = t.id and status = 'scheduled';
  if can_close then
    -- nothing left to decide on a finished task (R94)
    update public.decisions set status = 'finished', resolved_by = p_profile, resolved_at = now()
     where task_id = t.id and status = 'pending';
  else
    -- like Done: a review round for whoever gave it, or the owner's manager when they gave it to themselves
    reviewer := case when t.assigner_id is not null and t.assigner_id <> p_profile then t.assigner_id else o.manager_id end;
    select coalesce(max(round), 0) + 1 into next_round from public.reviews where task_id = t.id;
    insert into public.reviews (task_id, round, submitted_by, submission_note, reviewer_id)
    values (t.id, next_round, p_profile, left(coalesce(p_why, ''), 500), reviewer);
  end if;

  insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
  values (p_profile, 'changed_for_you', null, t.id,
          left(case when can_close then format('Closed "%s": you already handled it', t.title)
                    else format('Sent "%s" for review: you already handled it', t.title) end, 200),
          'From your conversation. Not right? Open it and reopen.',
          left(case when can_close then format('قفّلت «%s»: خلّصتها في المحادثة', t.title)
                    else format('أرسلت «%s» للمراجعة: خلّصتها في المحادثة', t.title) end, 200),
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