-- A written reply to Saree3 that says "I'm too busy" (owner: "no one noticed it"): it becomes a workload decision for
-- the manager (move this one working day, or which other task can wait) and the person is told it reached them.
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
  busy boolean;
  boss_name text;
  open_list jsonb;
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
  select split_part(coalesce(full_name_ar, full_name), ' ', 1) into boss_name from public.profiles where id = boss;
  -- a written answer that says they're too busy (whatever button it came with) is a workload question for the manager,
  -- not a blocker: Saree3 asks what can move, with his suggestion, and tells the person it reached their manager
  busy := p_reply in ('blocked', 'need_time', 'on_track')
    and note ~* '(مشغول|مضغوط|ضغط|ما عندي وقت|مافي وقت|ما فيه وقت|ما لحقت|زحمة|busy|swamped|no time|overloaded|too much)';

  if busy then
    if t.status in ('assigned', 'draft', 'returned', 'blocked') then
      update public.tasks set status = 'in_progress' where id = p_task;
    end if;
    new_due := coalesce(greatest(t.due_at, now()), now()) + interval '1 day';
    while extract(isodow from new_due at time zone 'Asia/Riyadh') in (5, 6) loop
      new_due := new_due + interval '1 day';
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'due_at', o.due_at) order by o.due_at nulls last), '[]'::jsonb)
      into open_list
      from (select id, title, due_at from public.tasks
             where owner_id = me and id <> p_task and status in ('assigned', 'in_progress', 'blocked', 'returned')
             order by due_at nulls last limit 5) o;
    if boss is not null and not exists (
      select 1 from public.decisions where task_id = p_task and type in ('priority_question', 'extension_request') and status = 'pending'
    ) then
      insert into public.decisions (task_id, manager_id, requested_by, type, title, title_ar, details,
                                    recommendation, recommendation_ar, recommendation_reason)
      values (
        p_task, boss, me, 'priority_question',
        left(format('%s is too busy for "%s"', who, t.title), 200),
        left(format('%s مشغول عن «%s»', who_ar, t.title), 200),
        jsonb_build_object('new_due_at', new_due, 'reason', note, 'asked_from', 'reply', 'open_tasks', open_list),
        format('Move it one working day (to %s), or tell me which of their %s other tasks can wait',
               to_char(new_due at time zone 'Asia/Riyadh', 'Dy DD Mon'), jsonb_array_length(open_list)),
        format('أجّلها يوم عمل (لين %s)، أو قل لي أي مهمة من مهامه الثانية (%s) تقدر تنتظر',
               to_char(new_due at time zone 'Asia/Riyadh', 'DD/MM'), jsonb_array_length(open_list)),
        note
      );
    end if;
    -- the person hears back right away: it reached their manager
    insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
    values (
      me, 'request_answered', me, p_task,
      left(format('Got it ✓ I told %s you''re busy with "%s"', coalesce(boss_name, 'your manager'), t.title), 200),
      'I''ll tell you what they decide. Nothing for you to do now.',
      left(format('وصلت ✓ قلت لـ %s إنك مشغول عن «%s»', coalesce(boss_name, 'مديرك'), t.title), 200),
      'أرجع لك أول ما يقرر. ما عليك شي الحين.',
      'busy:' || p_task || ':' || to_char(now(), 'YYYYMMDDHH24MI')
    )
    on conflict (dedupe_key) do nothing;
    result := 'busy';
  elsif p_reply = 'done' then
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
            when 'need_time' then 'يحتاج وقت' else 'ماشية تمام' end)
            || case when busy then ' (مشغول: سألت المدير وش يتأجل)' else '' end,
          note, false);
  return result;
end;
$$;

revoke all on function public.checkin_reply(uuid, text, text) from public, anon;
grant execute on function public.checkin_reply(uuid, text, text) to authenticated;
