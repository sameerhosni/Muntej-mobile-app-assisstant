-- «اسأل» on a task's clarity card (Nouran, 8 Nov: "This is a task assigned from me to sameer, why would I have cta
-- 'send nouran' and when I click it twice why does it turn the task to 100%?"). The button only ticked the missing
-- item on the screen. Now the person doing the task asks the person who gave it, for real: an alert (push, Alerts list)
-- that opens the task. Nothing is filled in by asking, so the clarity ring only moves when the giver adds it.

alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind in (
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
  'objective_achieved', 'objective_at_risk', 'objective_missed', 'changed_for_you',
  'task_assigned', 'new_submission', 'decision_waiting', 'no_reply', 'escalated', 'tool_sync', 'new_feature',
  'request_answered', 'ladder_nudge', 'support_reply', 'idea_update', 'member_joined', 'added_to_company',
  'detail_asked'
));

-- p_what: 'budget' | 'doneDef' | 'due'. Only the person doing the task (owner or helper) asks, and only someone else
-- who gave it; once a day per item. True = asked now, false = already asked today.
create or replace function public.ask_task_detail(p_task uuid, p_what text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
  who_en text;
  who_ar text;
  what_en text;
  what_ar text;
  sent integer;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  select * into t from public.tasks where id = p_task;
  if t.id is null or me not in (coalesce(t.owner_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(t.helper_id, '00000000-0000-0000-0000-000000000000'::uuid)) then
    raise exception 'Only the person doing this task can ask about it';
  end if;
  if t.assigner_id is null or t.assigner_id = me then
    raise exception 'You gave this task: add it yourself';
  end if;
  case p_what
    when 'budget' then what_en := 'budget'; what_ar := 'الميزانية';
    when 'doneDef' then what_en := 'definition of done'; what_ar := 'تعريف الإنجاز';
    when 'due' then what_en := 'due date'; what_ar := 'الموعد';
    else raise exception 'Unknown detail';
  end case;
  select split_part(p.full_name, ' ', 1), split_part(coalesce(nullif(p.full_name_ar, ''), p.full_name), ' ', 1)
    into who_en, who_ar
    from public.profiles p where p.id = me;

  insert into public.alerts (profile_id, kind, task_id, subject_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    t.assigner_id, 'detail_asked', t.id, me,
    format('%s asks about the %s', who_en, what_en),
    format('"%s": add the %s on the task so the work isn''t held up.', t.title, what_en),
    -- an Arabic word between the name and the rest, so a Latin name can't swap sides
    format('يسأل %s عن %s', who_ar, what_ar),
    format('«%s»: أضف %s في المهمة عشان الشغل ما يتعطل.', t.title, what_ar),
    'ask:' || t.id || ':' || p_what || ':' || (now() at time zone 'Asia/Riyadh')::date
  )
  on conflict (dedupe_key) do nothing;
  get diagnostics sent = row_count;
  if sent > 0 then
    insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
    values ('user', me, t.assigner_id, t.id, 'detail_asked', format('Asked for the %s', what_en), format('سأل عن %s', what_ar), false);
  end if;
  return sent > 0;
end;
$$;
revoke all on function public.ask_task_detail(uuid, text) from public, anon;
grant execute on function public.ask_task_detail(uuid, text) to authenticated;
