-- Saree3 runs the whole cycle after a task is given (owner's position: the manager never chases anyone).
-- The hand-off message now has answers right on it: Got it · Need more time · Need help. checkin_reply learns the
-- first two ("need help" is the existing 'blocked' answer with the reason):
--   got_it    → the task counts as received (assigned → in_progress); nobody else is bothered
--   need_time → received + a "needs more time" decision for the person above, with Saree3's suggestion (one more
--               working day after the current due date). Approving it moves the date (useResolveDecision).
create or replace function public.checkin_reply(p_task uuid, p_reply text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
  boss uuid;
  who text;
  who_ar text;
  note text := nullif(trim(coalesce(p_note, '')), '');
  result text;
  new_due timestamptz;
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    raise exception 'Task not found';
  end if;
  if t.owner_id is distinct from me then
    raise exception 'Only the owner can answer this check-in';
  end if;
  if t.status in ('done', 'cancelled') then
    return t.status::text;
  end if;
  select split_part(full_name, ' ', 1), split_part(coalesce(full_name_ar, full_name), ' ', 1) into who, who_ar
    from public.profiles where id = me;
  boss := coalesce((select manager_id from public.profiles where id = me), nullif(t.assigner_id, me));

  if p_reply = 'done' then
    result := public.set_task_status(p_task, 'done', note, true);
  elsif p_reply = 'blocked' then
    result := public.set_task_status(p_task, 'blocked', note, true);
    -- the exception: tell the person above right away, in their words
    if boss is not null then
      insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
      values (
        boss, 'escalated', me, p_task,
        left(format('%s needs help on "%s"', who, t.title), 200),
        coalesce(note, 'No reason given. Open it to decide what to do.'),
        left(format('%s يحتاج مساعدة في «%s»', who_ar, t.title), 200),
        coalesce(note, 'ما ذكر السبب. افتحها وقرّر وش نسوي.'),
        'blocker:' || p_task || ':' || to_char(now(), 'YYYYMMDDHH24MI')
      )
      on conflict (dedupe_key) do nothing;
    end if;
  elsif p_reply in ('on_track', 'got_it') then
    if t.status in ('assigned', 'draft', 'returned') then
      update public.tasks set status = 'in_progress' where id = p_task;
    end if;
    result := p_reply;
  elsif p_reply = 'need_time' then
    if t.status in ('assigned', 'draft', 'returned') then
      update public.tasks set status = 'in_progress' where id = p_task;
    end if;
    -- one more working day (Sun–Thu) after the current due date, or after tomorrow when there is none
    new_due := coalesce(t.due_at, now()) + interval '1 day';
    while extract(isodow from new_due at time zone 'Asia/Riyadh') in (5, 6) loop
      new_due := new_due + interval '1 day';
    end loop;
    if boss is not null and not exists (
      select 1 from public.decisions where task_id = p_task and type = 'extension_request' and status = 'pending'
    ) then
      insert into public.decisions (task_id, manager_id, requested_by, type, title, title_ar, details,
                                    recommendation, recommendation_ar, recommendation_reason)
      values (
        p_task, boss, me, 'extension_request',
        left(format('%s asks for more time on "%s"', who, t.title), 200),
        left(format('%s يطلب وقت زيادة في «%s»', who_ar, t.title), 200),
        jsonb_build_object('new_due_at', new_due, 'reason', note, 'asked_from', 'handoff'),
        format('Give one more working day (until %s)', to_char(new_due at time zone 'Asia/Riyadh', 'Dy DD Mon, HH12:MI AM')),
        format('عطه يوم عمل زيادة (لين %s)', to_char(new_due at time zone 'Asia/Riyadh', 'DD/MM HH12:MI AM')),
        coalesce(note, 'Asked from Saree3''s message, no reason given')
      );
    end if;
    result := 'need_time';
  else
    raise exception 'Unknown reply %', p_reply;
  end if;

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, reason, undoable)
  values ('user', me, me, p_task, 'update_received',
          format('Answered Saree3 on "%s": %s', t.title, replace(p_reply, '_', ' ')),
          format('رد على سريع في «%s»: %s', t.title, case p_reply
            when 'done' then 'خلصت' when 'blocked' then 'يحتاج مساعدة' when 'got_it' then 'استلمها'
            when 'need_time' then 'يحتاج وقت' else 'ماشية تمام' end),
          note, false);
  return result;
end;
$$;

revoke all on function public.checkin_reply(uuid, text, text) from public, anon;
grant execute on function public.checkin_reply(uuid, text, text) to authenticated;
