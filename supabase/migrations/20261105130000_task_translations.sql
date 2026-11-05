-- A task written in one language reaches each person in theirs (a customer's question, owner 5 Nov: "send task in english,
-- but the recipient gets it in arabic"). The original stays in tasks; translations live next to it:
--   tasks.translations = { "ar": { title, description, goal, definition_of_done, steps: { <subtask id>: title } } }
-- translate-task (OpenAI, server only) fills them. Changing a text clears only that text's translations, so nobody reads
-- an out-of-date one, and asks for a new one. Alerts, follow-ups, decisions and log lines quote the title in their own
-- language's column, so they're fixed in one place here instead of in every function that writes them.

alter table public.tasks
  add column if not exists source_language text,
  add column if not exists source_by uuid references public.profiles (id) on delete set null,
  add column if not exists translations jsonb not null default '{}'::jsonb;

create index if not exists alerts_task_idx on public.alerts (task_id);
create index if not exists decisions_task_idx on public.decisions (task_id);

-- one translator at a time per task (a task with 5 new steps asks 6 times)
create table if not exists public.task_translation_runs (
  task_id uuid primary key references public.tasks (id) on delete cascade,
  claimed_at timestamptz not null default now()
);
alter table public.task_translation_runs enable row level security;

-- the language most of the text's letters are in; null when there are no letters
create or replace function public.text_language(t text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  a int := length(regexp_replace(coalesce(t, ''), '[^؀-ۿ]', '', 'g'));
  h int := length(regexp_replace(coalesce(t, ''), '[^ऀ-ॿ]', '', 'g'));
  l int := length(regexp_replace(coalesce(t, ''), '[^A-Za-z]', '', 'g'));
begin
  if a = 0 and h = 0 and l = 0 then return null; end if;
  if a >= l and a >= h then return 'ar'; end if;
  if h >= l then return 'hi'; end if;
  return 'en';
end;
$$;

-- tasks already here: their language and writer, without counting as a change to them
alter table public.tasks disable trigger user;
update public.tasks
   set source_language = public.text_language(concat_ws(' ', title, description, goal, definition_of_done)), source_by = assigner_id
 where source_language is null;
alter table public.tasks enable trigger user;

-- the languages this task must be read in, other than its own: the people on it
create or replace function public.task_translation_targets(p_task uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct p.locale), '{}')
    from public.tasks t
    join public.profiles p
      on p.id in (t.owner_id, t.assigner_id, t.helper_id)
      or p.id in (select s.owner_id from public.subtasks s where s.task_id = t.id)
   where t.id = p_task
     and t.source_language is not null
     and p.locale <> t.source_language
     and p.locale in ('en', 'ar');
$$;

-- asks for a translation when someone needs one; a failed call never gets in the way of the task itself
create or replace function public.request_task_translation(p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(array_length(public.task_translation_targets(p_task), 1), 0) = 0 then return; end if;
  perform net.http_post(
    url := 'https://katwiedukkvssuxbjbqf.supabase.co/functions/v1/translate-task',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := jsonb_build_object('task_id', p_task)
  );
exception when others then
  raise warning 'task translation not requested: %', sqlerrm;
end;
$$;

-- what changed loses its translations; who wrote it keeps reading their own words
create or replace function public.task_source_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[] := '{}';
  k text;
begin
  new.source_language := public.text_language(concat_ws(' ', new.title, new.description, new.goal, new.definition_of_done));
  if tg_op = 'INSERT' then
    new.source_by := coalesce(new.source_by, public.current_profile_id(), new.assigner_id);
    return new;
  end if;
  if new.title is distinct from old.title then changed := changed || 'title'::text; end if;
  if new.description is distinct from old.description then changed := changed || 'description'::text; end if;
  if new.goal is distinct from old.goal then changed := changed || 'goal'::text; end if;
  if new.definition_of_done is distinct from old.definition_of_done then changed := changed || 'definition_of_done'::text; end if;
  if cardinality(changed) = 0 then return new; end if;
  new.source_by := coalesce(public.current_profile_id(), old.source_by, new.assigner_id);
  if new.source_language is distinct from old.source_language then
    new.translations := '{}'::jsonb;
  else
    for k in select jsonb_object_keys(new.translations) loop
      new.translations := jsonb_set(new.translations, array[k], (new.translations -> k) - changed);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists task_source_changed on public.tasks;
create trigger task_source_changed before insert or update of title, description, goal, definition_of_done on public.tasks
  for each row execute function public.task_source_changed();

-- a translation being saved isn't a change to the task: "updated" keeps meaning a person or Muntej changed the work
-- (named so it runs after tasks_updated_at)
create or replace function public.task_translation_keeps_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.translations is distinct from old.translations
     and (to_jsonb(new) - 'translations' - 'updated_at') = (to_jsonb(old) - 'translations' - 'updated_at') then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_updated_at_translation on public.tasks;
create trigger tasks_updated_at_translation before update on public.tasks
  for each row execute function public.task_translation_keeps_updated_at();

create or replace function public.task_needs_translation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.request_task_translation(new.id);
  return new;
end;
$$;

drop trigger if exists task_needs_translation on public.tasks;
create trigger task_needs_translation after insert or update of title, description, goal, definition_of_done, owner_id, helper_id on public.tasks
  for each row execute function public.task_needs_translation();

-- steps: same rules, kept on their task
create or replace function public.step_source_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tid uuid := coalesce(new.task_id, old.task_id);
  tr jsonb;
  k text;
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.title is distinct from old.title) then
    select translations into tr from public.tasks where id = tid;
    if tr is not null and tr <> '{}'::jsonb then
      for k in select jsonb_object_keys(tr) loop
        tr := tr #- array[k, 'steps', old.id::text];
      end loop;
      update public.tasks set translations = tr where id = tid;
    end if;
  end if;
  if tg_op <> 'DELETE' then perform public.request_task_translation(tid); end if;
  return null;
end;
$$;

drop trigger if exists step_source_changed on public.subtasks;
create trigger step_source_changed after insert or delete or update of title, owner_id on public.subtasks
  for each row execute function public.step_source_changed();

-- swaps the task's title and steps in a text for their translation; a short title could match inside another word
create or replace function public.task_text_in(txt text, p_task uuid, p_lang text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t record;
  s record;
  tr jsonb;
  out_txt text := txt;
begin
  if txt is null or p_task is null then return txt; end if;
  select title, translations into t from public.tasks where id = p_task;
  tr := t.translations -> p_lang;
  if tr is null then return txt; end if;
  for s in select id, title from public.subtasks where task_id = p_task loop
    if length(s.title) >= 3 and tr -> 'steps' ->> s.id::text is not null then
      out_txt := replace(out_txt, s.title, tr -> 'steps' ->> s.id::text);
    end if;
  end loop;
  if length(t.title) >= 3 and tr ->> 'title' is not null then
    out_txt := replace(out_txt, t.title, tr ->> 'title');
  end if;
  return out_txt;
end;
$$;

create or replace function public.alert_task_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.task_id is not null then
    new.title := public.task_text_in(new.title, new.task_id, 'en');
    new.body := public.task_text_in(new.body, new.task_id, 'en');
    new.title_ar := public.task_text_in(new.title_ar, new.task_id, 'ar');
    new.body_ar := public.task_text_in(new.body_ar, new.task_id, 'ar');
  end if;
  return new;
end;
$$;
drop trigger if exists alert_task_text on public.alerts;
create trigger alert_task_text before insert on public.alerts for each row execute function public.alert_task_text();

create or replace function public.followup_task_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.message := public.task_text_in(new.message, new.task_id, 'en');
  new.message_ar := public.task_text_in(new.message_ar, new.task_id, 'ar');
  return new;
end;
$$;
drop trigger if exists followup_task_text on public.followups;
create trigger followup_task_text before insert on public.followups for each row execute function public.followup_task_text();

create or replace function public.decision_task_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.task_id is not null then
    new.title := public.task_text_in(new.title, new.task_id, 'en');
    new.recommendation := public.task_text_in(new.recommendation, new.task_id, 'en');
    new.title_ar := public.task_text_in(new.title_ar, new.task_id, 'ar');
    new.recommendation_ar := public.task_text_in(new.recommendation_ar, new.task_id, 'ar');
  end if;
  return new;
end;
$$;
drop trigger if exists decision_task_text on public.decisions;
create trigger decision_task_text before insert on public.decisions for each row execute function public.decision_task_text();

create or replace function public.activity_task_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.task_id is not null then
    new.summary := public.task_text_in(new.summary, new.task_id, 'en');
    new.summary_ar := public.task_text_in(new.summary_ar, new.task_id, 'ar');
  end if;
  return new;
end;
$$;
drop trigger if exists activity_task_text on public.activity_log;
create trigger activity_task_text before insert on public.activity_log for each row execute function public.activity_task_text();

-- translate-task only. p_source is the text it translated: a piece that changed in the meantime is not saved (the edit
-- asked for its own translation). Rows already written get the translated title too: a new task's alert and first
-- follow-up are written before its translation exists. Returns whether this language is new on the task.
create or replace function public.save_task_translation(p_task uuid, p_lang text, p_source jsonb, p_out jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  cur jsonb;
  f text;
  s record;
  first_time boolean;
begin
  select * into t from public.tasks where id = p_task for update;
  if t.id is null then return false; end if;
  first_time := not (t.translations ? p_lang);
  cur := coalesce(t.translations -> p_lang, '{}'::jsonb);
  foreach f in array array['title', 'description', 'goal', 'definition_of_done'] loop
    if nullif(trim(p_out ->> f), '') is not null and p_source ->> f is not distinct from to_jsonb(t) ->> f then
      cur := jsonb_set(cur, array[f], p_out -> f);
    end if;
  end loop;
  for s in select id, title from public.subtasks where task_id = p_task loop
    if nullif(trim(p_out -> 'steps' ->> s.id::text), '') is not null and p_source -> 'steps' ->> s.id::text is not distinct from s.title then
      cur := jsonb_set(cur, array['steps'], coalesce(cur -> 'steps', '{}'::jsonb) || jsonb_build_object(s.id::text, p_out -> 'steps' -> s.id::text));
    end if;
  end loop;
  update public.tasks set translations = jsonb_set(translations, array[p_lang], cur) where id = p_task;

  update public.alerts set
    title = public.task_text_in(title, p_task, 'en'), body = public.task_text_in(body, p_task, 'en'),
    title_ar = public.task_text_in(title_ar, p_task, 'ar'), body_ar = public.task_text_in(body_ar, p_task, 'ar')
   where task_id = p_task;
  update public.followups set
    message = public.task_text_in(message, p_task, 'en'), message_ar = public.task_text_in(message_ar, p_task, 'ar')
   where task_id = p_task;
  update public.decisions set
    title = public.task_text_in(title, p_task, 'en'), recommendation = public.task_text_in(recommendation, p_task, 'en'),
    title_ar = public.task_text_in(title_ar, p_task, 'ar'), recommendation_ar = public.task_text_in(recommendation_ar, p_task, 'ar')
   where task_id = p_task;

  if first_time then
    insert into public.activity_log (actor_type, task_id, action, summary, summary_ar, reason, undoable)
    values (
      'muntej', p_task, 'task_translated',
      format('Translated "%s" so everyone on it can read it', t.title),
      format('ترجمت «%s» عشان كل اللي عليها يقرونها', t.title),
      format('%s → %s', t.source_language, p_lang),
      false
    );
  end if;
  return first_time;
end;
$$;

-- true while it's worth holding a message for the translation: the task is new and this person's language isn't ready.
-- After 2 minutes (a failed translation) the message goes out with the original words.
create or replace function public.task_translation_pending(p_task uuid, p_lang text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
     where t.id = p_task
       and t.created_at > now() - interval '2 minutes'
       and p_lang = any (public.task_translation_targets(p_task))
       and t.translations -> p_lang ->> 'title' is null
  );
$$;

create or replace function public.claim_task_translation(p_task uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  insert into public.task_translation_runs as r (task_id) values (p_task)
  on conflict (task_id) do update set claimed_at = now() where r.claimed_at < now() - interval '90 seconds'
  returning true;
$$;

revoke all on function public.task_translation_targets(uuid) from public, anon, authenticated;
revoke all on function public.request_task_translation(uuid) from public, anon, authenticated;
revoke all on function public.save_task_translation(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.task_translation_pending(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_task_translation(uuid) from public, anon, authenticated;
revoke all on function public.task_text_in(text, uuid, text) from public, anon, authenticated;

insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('task_translation', 'all', now(), 'Tasks in your language',
   'المهام بلغتك',
   'A task written in English reaches you in Arabic, and the other way round. The original is one tap away.',
   'المهمة المكتوبة بالإنجليزي توصلك بالعربي، والعكس. والنص الأصلي على بعد ضغطة.', -21)
on conflict (key) do nothing;
