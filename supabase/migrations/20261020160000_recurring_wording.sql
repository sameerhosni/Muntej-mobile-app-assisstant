-- Human wording for recurring-task actions in activity_log (and the Alerts the owner gets). Same function otherwise.
create or replace function public.recurring_action(p_id uuid, p_action text, p_until date default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  r public.recurring_tasks;
begin
  select * into r from public.recurring_tasks where id = p_id;
  if not found then
    raise exception 'Recurring task not found';
  end if;
  case p_action
    when 'skip_next' then update public.recurring_tasks set skip_next = true where id = p_id;
    when 'pause' then
      if p_until is null then raise exception 'Pause until when?'; end if;
      update public.recurring_tasks set paused_until = p_until where id = p_id;
    when 'resume' then update public.recurring_tasks set paused_until = null, skip_next = false where id = p_id;
    when 'stop' then update public.recurring_tasks set status = 'stopped', next_due_at = null where id = p_id;
    else raise exception 'Unknown action %', p_action;
  end case;
  if not found then
    raise exception 'Not allowed to change this recurring task';
  end if;
  insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, reason, undoable)
  values ('user', me, coalesce(r.owner_id, r.rotation[1], me), 'recurring_' || p_action,
          format(case p_action
            when 'skip_next' then 'Skipped the next "%s"'
            when 'pause' then 'Paused recurring task "%s"'
            when 'resume' then 'Restarted recurring task "%s"'
            else 'Stopped recurring task "%s"' end, r.title),
          format('%s المهمة المتكررة «%s»',
                 case p_action when 'skip_next' then 'تخطيت المرة الجاية من' when 'pause' then 'وقّفت مؤقتاً' when 'resume' then 'رجّعت' else 'أوقفت' end, r.title),
          case when p_until is not null then format('Until %s', p_until) end, false);
end;
$$;
