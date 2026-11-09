-- Owner, 9 Nov: "if task already done so let the user finish it from this page not to assign then transfer it to tasks
-- page then approve it". finish_from_decision: the person the decision waits on closes its task as done, here and now.
--   * the decision becomes 'finished' (no other trigger acts on it: no new date, no "took it back", no "said yes")
--   * the task is closed (done, 100%), its waiting reminders stop — whoever owns it, so a manager with a boss isn't
--     sent into a review of their own
--   * logged, and whoever asked hears one honest line: "X closed it: it was already done"
create or replace function public.finish_from_decision(p_decision uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  d public.decisions;
  t public.tasks;
  who_en text;
  who_ar text;
begin
  if me is null then raise exception 'Not signed in'; end if;
  -- testers first (features.testing), everyone once it goes live
  if not public.feature_on('decision_finish') then raise exception 'Not available yet'; end if;
  select * into d from public.decisions where id = p_decision;
  if d.id is null then raise exception 'Decision not found'; end if;
  -- yours, or an admin's of the same company (reviewer, 9 Nov: an admin of any company could close it)
  if d.manager_id <> me and not (public.is_admin() and public.same_account(d.manager_id)) then
    raise exception 'This decision isn''t yours to make';
  end if;
  if d.status <> 'pending' then return d.status::text; end if;
  if d.task_id is null then raise exception 'Nothing to close: this decision has no task'; end if;
  select * into t from public.tasks where id = d.task_id;

  update public.decisions set status = 'finished', resolved_by = me, resolved_at = now() where id = d.id;
  if t.status not in ('done', 'cancelled') then
    -- a task nobody owned is credited to whoever closed it (reviewer, 9 Nov: it showed «لسه ما أحد»)
    update public.tasks set status = 'done', closed_at = now(), progress = 100, owner_id = coalesce(owner_id, me) where id = t.id;
    update public.followups set status = 'cancelled' where task_id = t.id and status = 'scheduled';
    update public.reviews set decision = 'approved', decided_at = now(), reviewer_id = coalesce(reviewer_id, me)
     where task_id = t.id and decision is null;
  end if;

  select split_part(full_name, ' ', 1), split_part(coalesce(nullif(full_name_ar, ''), full_name), ' ', 1)
    into who_en, who_ar from public.profiles where id = me;
  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, reason, undoable)
  values ('user', me, coalesce(d.requested_by, t.owner_id, me), t.id, 'closed_already_done',
          format('Closed "%s": it was already done', t.title), format('قفل «%s»: كانت خالصة أصلاً', t.title),
          d.title, false);
  if d.requested_by is not null and d.requested_by <> me then
    insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
    values (d.requested_by, 'request_answered', me, t.id,
            left(format('%s closed "%s"', who_en, t.title), 200), 'It was already done. Nothing more needed from you.',
            left(format('قفّل %s «%s»', who_ar, t.title), 200), 'كانت خالصة أصلاً، ما يحتاج منك شي.',
            'finished:' || d.id)
    on conflict (dedupe_key) do nothing;
  end if;
  -- every other open card on the same task closes with it (3rd review, R94): none is left to move a done task's
  -- date or owner later; each asker hears the same line
  insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
  select o.requested_by, 'request_answered', me, t.id,
         left(format('%s closed "%s"', who_en, t.title), 200), 'It was already done. Nothing more needed from you.',
         left(format('قفّل %s «%s»', who_ar, t.title), 200), 'كانت خالصة أصلاً، ما يحتاج منك شي.',
         'finished:' || o.id
    from public.decisions o
   where o.task_id = t.id and o.status = 'pending' and o.id <> d.id
     and o.requested_by is not null and o.requested_by <> me
     and o.requested_by is distinct from d.requested_by
  on conflict (dedupe_key) do nothing;
  update public.decisions set status = 'finished', resolved_by = me, resolved_at = now()
   where task_id = t.id and status = 'pending' and id <> d.id;
  return 'finished';
end;
$$;
revoke all on function public.finish_from_decision(uuid) from public, anon;
grant execute on function public.finish_from_decision(uuid) to authenticated;

-- announced by Saree3 (features row + FEATURE_PLACES + TourTarget)
insert into public.features (key, audience, released_at, testing, title, title_ar, benefit, benefit_ar, sort) values
  ('decision_finish', 'manager', now(), true, 'Close it right on the decision',
   'قفّلها من القرار نفسه',
   'A decision about work that''s already done? Tap «Already done» on its card: it closes, its reminders stop, and whoever asked is told.',
   'قرار عن شغل خالص أصلاً؟ اضغط «خلصت أصلاً» على بطاقته: تنقفل، وتوقف تذكيراتها، واللي سأل يدري.', -23)
on conflict (key) do nothing;
