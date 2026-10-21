-- Steps (subtasks), Muntej-style: Muntej suggests the breakdown, people add steps by typing, pasting a list or saying
-- them, each step can have its own person and date, the task's progress follows the steps, and late steps are
-- chased like late tasks. Someone given a step sees it in their Today list even when the task itself isn't theirs.

alter table public.subtasks
  add column if not exists due_at timestamptz,
  add column if not exists done_at timestamptz,
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

-- done_at follows done
create or replace function public.subtask_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then new.done_at := now(); end if;
  if not new.done then new.done_at := null; end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists subtasks_done_at on public.subtasks;
create trigger subtasks_done_at before insert or update on public.subtasks for each row execute function public.subtask_done_at();

-- the task's progress = steps done (while it's still being worked on)
create or replace function public.task_progress_from_steps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t uuid := coalesce(new.task_id, old.task_id);
  total int;
  finished int;
begin
  select count(*), count(*) filter (where done) into total, finished from public.subtasks where task_id = t;
  if total > 0 then
    update public.tasks set progress = round(finished * 100.0 / total)
     where id = t and status not in ('done', 'cancelled', 'submitted') and progress is distinct from round(finished * 100.0 / total);
  end if;
  return null;
end;
$$;
drop trigger if exists subtasks_progress on public.subtasks;
create trigger subtasks_progress after insert or update of done or delete on public.subtasks
  for each row execute function public.task_progress_from_steps();

-- add steps (after the last one); a step given to someone else tells them (activity_log → alert)
create or replace function public.add_steps(p_task uuid, p_titles text[], p_owner uuid default null, p_due timestamptz default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  base smallint;
  n integer := 0;
  title text;
  t public.tasks;
begin
  if not public.can_see_task(p_task) then raise exception 'Not allowed to change this task'; end if;
  select * into t from public.tasks where id = p_task;
  select coalesce(max(position), -1) into base from public.subtasks where task_id = p_task;
  foreach title in array p_titles loop
    title := left(trim(title), 200);
    continue when title = '';
    n := n + 1;
    insert into public.subtasks (task_id, title, owner_id, due_at, position, created_by)
    values (p_task, title, p_owner, p_due, base + n, me);
  end loop;
  if n > 0 then
    insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
    values ('user', me, coalesce(case when p_owner <> me then p_owner end, t.owner_id, me), p_task, 'steps_added',
            case when n = 1 then format('Added a step to "%s": %s', t.title, p_titles[1]) else format('Added %s steps to "%s"', n, t.title) end,
            case when n = 1 then format('أضاف خطوة لـ«%s»: %s', t.title, p_titles[1]) else format('أضاف %s خطوات لـ«%s»', n, t.title) end,
            false);
  end if;
  return n;
end;
$$;
revoke all on function public.add_steps(uuid, text[], uuid, timestamptz) from public, anon;
grant execute on function public.add_steps(uuid, text[], uuid, timestamptz) to authenticated;

-- change one step (title / person / date); giving it to someone tells them
create or replace function public.set_step(p_id uuid, p jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  s public.subtasks;
  t public.tasks;
  new_owner uuid;
begin
  select * into s from public.subtasks where id = p_id;
  if not found or not public.can_see_task(s.task_id) then raise exception 'Not allowed'; end if;
  select * into t from public.tasks where id = s.task_id;
  new_owner := case when p ? 'owner_id' then nullif(p ->> 'owner_id', '')::uuid else s.owner_id end;
  update public.subtasks set
    title = coalesce(nullif(left(trim(p ->> 'title'), 200), ''), title),
    owner_id = new_owner,
    due_at = case when p ? 'due_at' then nullif(p ->> 'due_at', '')::timestamptz else due_at end
  where id = p_id;
  if new_owner is not null and new_owner is distinct from s.owner_id and new_owner <> me then
    insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
    values ('user', me, new_owner, s.task_id, 'step_assigned',
            format('Gave you a step on "%s": %s', t.title, coalesce(nullif(p ->> 'title', ''), s.title)),
            format('عطاك خطوة في «%s»: %s', t.title, coalesce(nullif(p ->> 'title', ''), s.title)), false);
  end if;
end;
$$;
revoke all on function public.set_step(uuid, jsonb) from public, anon;
grant execute on function public.set_step(uuid, jsonb) to authenticated;

-- my open steps, even on tasks I can't otherwise see (Today list)
create or replace function public.my_steps()
returns table (id uuid, task_id uuid, task_title text, title text, due_at timestamptz, done boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.task_id, t.title, s.title, s.due_at, s.done
    from public.subtasks s join public.tasks t on t.id = s.task_id
   where s.owner_id = public.current_profile_id()
     and not s.done
     and t.status not in ('done', 'cancelled')
   order by s.due_at nulls last, s.position
   limit 20;
$$;
revoke all on function public.my_steps() from public, anon;
grant execute on function public.my_steps() to authenticated;

-- tick a step that's mine (works even when the task isn't visible to me)
create or replace function public.tick_my_step(p_id uuid, p_done boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
begin
  update public.subtasks set done = p_done where id = p_id and owner_id = me;
  if not found then raise exception 'Not your step'; end if;
end;
$$;
revoke all on function public.tick_my_step(uuid, boolean) from public, anon;
grant execute on function public.tick_my_step(uuid, boolean) to authenticated;

-- Muntej's suggested breakdown per task (asked once, kept)
create table if not exists public.step_suggestions (
  task_id uuid primary key references public.tasks (id) on delete cascade,
  steps jsonb not null default '[]', -- ["…", "…"]
  source text not null default 'ai' check (source in ('ai', 'last_time')),
  like_task_title text, -- "Like last time": the finished task the steps came from
  created_at timestamptz not null default now()
);
alter table public.step_suggestions enable row level security;
drop policy if exists step_suggestions_select on public.step_suggestions;
create policy step_suggestions_select on public.step_suggestions for select to authenticated using (public.can_see_task(task_id));
revoke insert, update, delete on public.step_suggestions from authenticated, anon;
grant select on public.step_suggestions to authenticated;

-- launch it
insert into public.features (key, audience, title, title_ar, benefit, benefit_ar, sort) values
  ('steps', 'all', 'Steps for every task', 'خطوات لكل مهمة',
   'Muntej breaks a task into steps for you. Add more by typing, pasting a list or saying them, give a step to someone, and progress fills itself in.',
   'منتج يقسّم المهمة لخطوات عنك. أضف بالكتابة أو لصق قائمة أو بصوتك، عطِ خطوة لأحد، والتقدّم يتعبّى لحاله.', 8)
on conflict (key) do nothing;
