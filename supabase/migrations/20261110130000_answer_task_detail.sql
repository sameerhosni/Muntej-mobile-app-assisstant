-- Owner, 10 Nov: "those questions I want to be able to answer them over whats app" (an employee's «يسأل … عن الموعد /
-- تعريف الإنجاز / الميزانية»). Approved checklist: the answer fills the task itself, the asker is told what was set,
-- the question leaves "Needs you" however it was answered, and internal notes never reach people.

-- 1. answer_task_detail: the giver fills what was asked (due date, definition of done, budget), or says there is none
--    (p_none). The asker hears it; the questions about it are cleared. Same rights as asking: only who gave the task.
create or replace function public.answer_task_detail(p_task uuid, p_what text, p_text text default null, p_due timestamptz default null, p_none boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
  who_en text;
  who_ar text;
  said_en text;
  said_ar text;
  asker uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into t from public.tasks where id = p_task;
  if t.id is null then raise exception 'Task not found'; end if;
  if t.assigner_id is distinct from me and not (public.is_admin() and public.same_account(t.owner_id)) then
    raise exception 'Only who gave this task can answer that';
  end if;
  if p_what not in ('due', 'doneDef', 'budget') then raise exception 'Unknown detail'; end if;
  select split_part(full_name, ' ', 1), split_part(coalesce(nullif(full_name_ar, ''), full_name), ' ', 1)
    into who_en, who_ar from public.profiles where id = me;

  if p_none then
    if p_what = 'due' then raise exception 'A task needs a due date'; end if;
    said_en := case p_what when 'budget' then 'there''s no budget for it' else 'nothing more is needed to call it done' end;
    said_ar := case p_what when 'budget' then 'ما لها ميزانية' else 'ما يحتاج شي زيادة عشان تعتبر خالصة' end;
  elsif p_what = 'due' then
    if p_due is null then raise exception 'Which date?'; end if;
    update public.tasks set due_at = p_due, expected_close_at = p_due where id = t.id;
    said_en := 'set the due date: ' || to_char(p_due at time zone 'Asia/Riyadh', 'Dy DD Mon, HH12:MI AM');
    said_ar := 'حطّ الموعد: ' || to_char(p_due at time zone 'Asia/Riyadh', 'DD/MM HH24:MI');
  else
    if coalesce(trim(p_text), '') = '' then raise exception 'Nothing to save'; end if;
    if p_what = 'doneDef' then
      update public.tasks set definition_of_done = left(trim(p_text), 1000) where id = t.id;
      said_en := 'set when it counts as done: ' || left(trim(p_text), 120);
      said_ar := 'حطّ تعريف الإنجاز: ' || left(trim(p_text), 120);
    else
      update public.tasks set budget = left(trim(p_text), 200) where id = t.id;
      said_en := 'set the budget: ' || left(trim(p_text), 120);
      said_ar := 'حطّ الميزانية: ' || left(trim(p_text), 120);
    end if;
  end if;

  -- who asked (the latest question about it), else the person doing it
  select a.subject_id into asker from public.alerts a
   where a.profile_id = me and a.kind = 'detail_asked' and a.task_id = t.id and a.dedupe_key like 'ask:' || t.id || ':' || p_what || ':%'
   order by a.created_at desc limit 1;
  asker := coalesce(asker, t.owner_id);
  -- the questions about it are answered: off "Needs you" (and the trigger below does the same for the app's edits)
  update public.alerts set read_at = coalesce(read_at, now())
   where profile_id = me and kind = 'detail_asked' and task_id = t.id and dedupe_key like 'ask:' || t.id || ':' || p_what || ':%';

  if asker is not null and asker <> me then
    insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
    values (asker, 'request_answered', me, t.id,
            left(format('%s %s', who_en, said_en), 200), format('"%s"', t.title),
            left(format('%s %s', who_ar, said_ar), 200), format('«%s»', t.title),
            'answered:' || t.id || ':' || p_what || ':' || extract(epoch from now())::bigint)
    on conflict (dedupe_key) do nothing;
  end if;
  -- logged as the giver's own change (subject = themself: the asker already got the clear alert above)
  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
  values ('user', me, me, t.id, 'detail_answered', format('Answered: %s', said_en), format('جاوب: %s', said_ar), false);
  return said_ar;
end;
$$;
revoke all on function public.answer_task_detail(uuid, text, text, timestamptz, boolean) from public, anon;
grant execute on function public.answer_task_detail(uuid, text, text, timestamptz, boolean) to authenticated;

-- 2. a question leaves "Needs you" as soon as what it asked for is on the task, whoever filled it and wherever
create or replace function public.clear_answered_questions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.due_at is not null and new.due_at is distinct from old.due_at then
    update public.alerts set read_at = coalesce(read_at, now())
     where kind = 'detail_asked' and task_id = new.id and dedupe_key like 'ask:' || new.id || ':due:%' and read_at is null;
  end if;
  if coalesce(new.definition_of_done, '') <> '' and new.definition_of_done is distinct from old.definition_of_done then
    update public.alerts set read_at = coalesce(read_at, now())
     where kind = 'detail_asked' and task_id = new.id and dedupe_key like 'ask:' || new.id || ':doneDef:%' and read_at is null;
  end if;
  if coalesce(new.budget, '') <> '' and new.budget is distinct from old.budget then
    update public.alerts set read_at = coalesce(read_at, now())
     where kind = 'detail_asked' and task_id = new.id and dedupe_key like 'ask:' || new.id || ':budget:%' and read_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists clear_answered_questions on public.tasks;
create trigger clear_answered_questions after update of due_at, definition_of_done, budget on public.tasks
  for each row execute function public.clear_answered_questions();

-- 3. the leak (Nouran's WhatsApp, 9 Nov: "Owner, 9 Nov: the chat sent «نوران»…", "N is at 4 h of 40 h this week."):
--    a "changed for you" alert shows the log's reason only when it is the person's own words (a sent-back note);
--    anything else is an internal note and stays in the log
create or replace function public.notify_subject_of_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text;
  who_ar text;
  task_title text;
  said text;
begin
  if new.actor_type <> 'user' or new.actor_id is null or new.subject_id is null or new.subject_id = new.actor_id then
    return new;
  end if;
  -- the same login in another company seat is still you (Nouran, 9 Nov: "I get notifications for actions I did")
  if exists (select 1 from public.profiles a join public.profiles s on s.user_id = a.user_id
             where a.id = new.actor_id and s.id = new.subject_id and a.user_id is not null) then
    return new;
  end if;
  -- these already send their own, clearer alert: one is enough
  if new.action in ('detail_asked', 'detail_answered', 'task_comment', 'more_time_asked', 'approval_asked', 'kudos_sent', 'busy_taken_back', 'person_renamed', 'closed_already_done') then
    return new;
  end if;
  if new.action in ('decision_approved', 'decision_declined') then
    return new;
  end if;
  select split_part(full_name, ' ', 1), split_part(coalesce(full_name_ar, full_name), ' ', 1)
    into who, who_ar from public.profiles where id = new.actor_id;

  if new.action = 'task_created' and new.task_id is not null then
    select title into task_title from public.tasks where id = new.task_id;
    insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
    values (
      new.subject_id, 'task_assigned', new.actor_id, new.task_id,
      left(format('%s assigned you: %s', coalesce(who, 'Someone'), coalesce(task_title, '')), 200),
      'Open it to see what is needed and when.',
      left(format('%s سند لك: %s', coalesce(who_ar, who, 'أحد'), coalesce(task_title, '')), 200),
      'افتحها تشوف المطلوب ومتى.',
      'change:' || new.id
    )
    on conflict (dedupe_key) do nothing;
    return new;
  end if;

  -- only the person's own words (what they wrote when sending it back) go to the other side
  said := case when new.action = 'sent_back' then coalesce(new.reason, '') else '' end;
  insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    new.subject_id, 'changed_for_you', new.actor_id, new.task_id,
    left(format('%s: %s', coalesce(who, 'Someone'), new.summary), 200),
    said,
    left(format('%s: %s', coalesce(who_ar, who, 'أحد'), coalesce(new.summary_ar, new.summary)), 200),
    said,
    'change:' || new.id
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
