-- One-tap check-in (BRD v1.2 FR-FUP-02/03, FR-EMP-01): a check-in push about your own task carries Done / On track /
-- Blocked buttons. The app calls checkin_reply with the button (and the reason typed under Blocked).
--   done     → the usual finish (sent for review, or closed when nobody is above you)
--   on_track → logged; Muntej doesn't ask again before the next planned check-in ("silence means on track")
--   blocked  → marked blocked with the reason, and the manager gets an alert right away (an exception)
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

  if p_reply = 'done' then
    result := public.set_task_status(p_task, 'done', note, true);
  elsif p_reply = 'blocked' then
    result := public.set_task_status(p_task, 'blocked', note, true);
    -- the exception: tell the person above right away, in their words
    boss := coalesce((select manager_id from public.profiles where id = me), nullif(t.assigner_id, me));
    if boss is not null then
      select split_part(full_name, ' ', 1), split_part(coalesce(full_name_ar, full_name), ' ', 1) into who, who_ar
        from public.profiles where id = me;
      insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
      values (
        boss, 'escalated', me, p_task,
        left(format('%s is blocked on "%s"', who, t.title), 200),
        coalesce(note, 'No reason given. Open it to decide what to do.'),
        left(format('%s واقف في «%s»', who_ar, t.title), 200),
        coalesce(note, 'ما ذكر السبب. افتحها وقرّر وش نسوي.'),
        'blocker:' || p_task || ':' || to_char(now(), 'YYYYMMDDHH24MI')
      )
      on conflict (dedupe_key) do nothing;
    end if;
  elsif p_reply = 'on_track' then
    if t.status in ('assigned', 'draft', 'returned') then
      update public.tasks set status = 'in_progress' where id = p_task;
    end if;
    result := 'on_track';
  else
    raise exception 'Unknown reply %', p_reply;
  end if;

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, reason, undoable)
  values ('user', me, me, p_task, 'update_received',
          format('Answered the check-in on "%s": %s', t.title, replace(p_reply, '_', ' ')),
          format('رد على متابعة «%s»: %s', t.title, case p_reply when 'done' then 'خلصت' when 'blocked' then 'واقفة' else 'ماشية تمام' end),
          note, false);
  return result;
end;
$$;

revoke all on function public.checkin_reply(uuid, text, text) from public, anon;
grant execute on function public.checkin_reply(uuid, text, text) to authenticated;
