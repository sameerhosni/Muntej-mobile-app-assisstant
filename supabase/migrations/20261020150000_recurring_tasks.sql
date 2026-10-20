-- Recurring tasks ("standup every Monday 10:00 for Faisal", "monthly report on the 1st", "rotate weekly between
-- Faisal and Noura"). A schedule row creates a normal task ahead of each occurrence (3 days for weekly/monthly,
-- the evening before for daily/workdays) via a 30-minute pg_cron job — all in SQL, no Edge Function.
-- Times are Riyadh local; the Saudi work week is Sunday–Thursday (a monthly date on Fri/Sat moves to Sunday).
-- Managed by chat (muntej-chat): upsert_recurring (create/change), recurring_action (skip next / pause / resume / stop).

create table public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete cascade, -- becomes each task's assigner
  title text not null,
  owner_id uuid references public.profiles (id) on delete set null,
  helper_id uuid references public.profiles (id) on delete set null,
  rotation uuid[] not null default '{}', -- when set, owners take turns in this order
  rot_index integer not null default 0,
  priority public.task_priority not null default 'medium',
  definition_of_done text,
  goal text,
  estimate_hours numeric(6, 1),
  workspace_id uuid references public.workspaces (id) on delete set null,
  objective_id uuid references public.objectives (id) on delete set null,
  freq text not null check (freq in ('daily', 'weekdays', 'weekly', 'monthly')),
  every integer not null default 1 check (every between 1 and 12), -- every N days / weeks / months
  weekdays smallint[] not null default '{}', -- weekly: 0 = Sunday … 6 = Saturday
  month_day smallint check (month_day = -1 or month_day between 1 and 31), -- monthly: -1 = last day
  time_of_day time not null default '17:00',
  starts_on date not null default (now() at time zone 'Asia/Riyadh')::date,
  ends_on date,
  next_due_at timestamptz,
  skip_next boolean not null default false,
  paused_until date,
  status text not null default 'active' check (status in ('active', 'stopped')),
  last_task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recurring_due_idx on public.recurring_tasks (status, next_due_at);
create trigger recurring_updated_at before update on public.recurring_tasks for each row execute function public.set_updated_at();

alter table public.recurring_tasks enable row level security;
create policy recurring_select on public.recurring_tasks for select to authenticated
  using (
    created_by = public.current_profile_id()
    or owner_id = public.current_profile_id()
    or public.current_profile_id() = any (rotation)
    or public.is_manager_of(owner_id)
  );
create policy recurring_insert on public.recurring_tasks for insert to authenticated
  with check (created_by = public.current_profile_id());
create policy recurring_update on public.recurring_tasks for update to authenticated
  using (created_by = public.current_profile_id() or public.is_manager_of(owner_id))
  with check (created_by = public.current_profile_id() or public.is_manager_of(owner_id));
create policy recurring_delete on public.recurring_tasks for delete to authenticated
  using (created_by = public.current_profile_id() or public.is_manager_of(owner_id));
grant select, insert, update, delete on public.recurring_tasks to authenticated;

-- ─── next occurrence strictly after `after` ───────────────────────────────────
create or replace function public.recurring_next(r public.recurring_tasks, after timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  d date := greatest((after at time zone 'Asia/Riyadh')::date, r.starts_on);
  cand date;
  at_ts timestamptz;
  week0 date := r.starts_on - extract(dow from r.starts_on)::int;
  m date;
  last_day int;
  i int;
begin
  if r.freq = 'monthly' then
    for i in 0..40 loop
      m := (date_trunc('month', d) + make_interval(months => i))::date;
      if ((extract(year from m) - extract(year from r.starts_on)) * 12 + extract(month from m) - extract(month from r.starts_on))::int % r.every <> 0 then
        continue;
      end if;
      last_day := extract(day from (m + interval '1 month' - interval '1 day'))::int;
      cand := m + (case when coalesce(r.month_day, 1) = -1 then last_day else least(coalesce(r.month_day, 1), last_day) end) - 1;
      -- Friday → Sunday, Saturday → Sunday
      cand := cand + case extract(dow from cand)::int when 5 then 2 when 6 then 1 else 0 end;
      at_ts := (cand + r.time_of_day) at time zone 'Asia/Riyadh';
      if cand >= r.starts_on and at_ts > after then
        return at_ts;
      end if;
    end loop;
    return null;
  end if;

  for i in 0..800 loop
    cand := d + i;
    at_ts := (cand + r.time_of_day) at time zone 'Asia/Riyadh';
    continue when at_ts <= after;
    if r.freq = 'daily' and (cand - r.starts_on) % r.every = 0 then
      return at_ts;
    elsif r.freq = 'weekdays' and extract(dow from cand)::int between 0 and 4 then
      return at_ts;
    elsif r.freq = 'weekly'
      and extract(dow from cand)::smallint = any (case when cardinality(r.weekdays) = 0 then array[extract(dow from r.starts_on)::smallint] else r.weekdays end)
      and ((cand - week0) / 7) % r.every = 0 then
      return at_ts;
    end if;
  end loop;
  return null;
end;
$$;

-- ─── the job: create the tasks whose time has come ────────────────────────────
-- security definer: runs from pg_cron (no signed-in user) and right after a schedule is saved.
create or replace function public.spawn_recurring_tasks(p_only uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.recurring_tasks;
  lead interval;
  owner uuid;
  owner_locale text;
  new_id uuid;
  made integer := 0;
  guard integer;
  day_before timestamptz;
begin
  for r in
    select * from public.recurring_tasks
     where status = 'active' and next_due_at is not null and (p_only is null or id = p_only)
     for update skip locked
  loop
    lead := case when r.freq in ('daily', 'weekdays') then interval '18 hours' else interval '3 days' end;
    guard := 0;
    while r.next_due_at is not null and r.next_due_at - lead <= now() and guard < 10 loop
      guard := guard + 1;
      if r.ends_on is not null and (r.next_due_at at time zone 'Asia/Riyadh')::date > r.ends_on then
        r.status := 'stopped';
        r.next_due_at := null;
        exit;
      end if;

      if r.paused_until is not null and (r.next_due_at at time zone 'Asia/Riyadh')::date <= r.paused_until then
        null; -- paused: this one is skipped
      elsif r.skip_next then
        r.skip_next := false;
      elsif r.next_due_at > now() - interval '1 day' then -- never back-fill old occurrences
        owner := case when cardinality(r.rotation) > 0 then r.rotation[(r.rot_index % cardinality(r.rotation)) + 1] else r.owner_id end;
        insert into public.tasks (
          title, owner_id, assigner_id, helper_id, workspace_id, objective_id, start_at, due_at, expected_close_at,
          priority, status, clarity_score, goal, definition_of_done, estimate_hours, source, source_ref
        ) values (
          r.title, owner, r.created_by, r.helper_id, r.workspace_id, r.objective_id, now(), r.next_due_at, r.next_due_at,
          r.priority, case when owner is null then 'draft' else 'assigned' end::public.task_status,
          (case when owner is not null then 25 else 0 end) + 25 + (case when r.definition_of_done is not null then 25 else 0 end),
          r.goal, r.definition_of_done, r.estimate_hours, 'agent', 'recurring:' || r.id
        )
        returning id into new_id;

        if owner is not null then
          select locale into owner_locale from public.profiles where id = owner;
          day_before := ((((r.next_due_at at time zone 'Asia/Riyadh')::date - 1) + time '09:00') at time zone 'Asia/Riyadh');
          if day_before > now() then
            insert into public.followups (task_id, recipient_id, scheduled_at, channel, message, message_ar, status)
            values (new_id, owner, day_before, 'push',
                    format('Reminder: "%s" is due tomorrow.', r.title), format('تذكير: «%s» موعدها بكرة.', r.title), 'scheduled');
          end if;
          insert into public.followups (task_id, recipient_id, scheduled_at, channel, message, message_ar, status)
          values (new_id, owner, r.next_due_at, 'push',
                  format('"%s" is due now.', r.title), format('«%s» موعدها الحين.', r.title), 'scheduled');
        end if;

        insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, reason, undoable)
        values ('muntej', null, coalesce(owner, r.created_by), new_id, 'task_created_recurring',
                format('Created "%s" (repeats %s)', r.title, r.freq),
                format('سويت «%s» (مهمة متكررة)', r.title),
                format('Recurring schedule %s', r.id), false);
        r.rot_index := r.rot_index + 1;
        r.last_task_id := new_id;
        made := made + 1;
      end if;
      r.next_due_at := public.recurring_next(r, r.next_due_at);
    end loop;

    update public.recurring_tasks
       set next_due_at = r.next_due_at, skip_next = r.skip_next, rot_index = r.rot_index,
           last_task_id = r.last_task_id, status = r.status
     where id = r.id;
  end loop;
  return made;
end;
$$;

-- ─── create / change a schedule (as the caller: RLS decides) ─────────────────
-- p: { id?, title, owner_id, helper_id, rotation[], priority, definition_of_done, goal, estimate_hours,
--      objective_id, freq, every, weekdays[], month_day, time_of_day 'HH:MM', starts_on, ends_on }
-- Only keys present change (on update). Returns the schedule id.
create or replace function public.upsert_recurring(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  rid uuid := nullif(p ->> 'id', '')::uuid;
  r public.recurring_tasks;
  is_new boolean := rid is null;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if is_new then
    if coalesce(trim(p ->> 'title'), '') = '' then
      raise exception 'Title is required';
    end if;
    insert into public.recurring_tasks (created_by, title, freq) values (me, trim(p ->> 'title'), coalesce(p ->> 'freq', 'weekly'))
    returning id into rid;
  end if;

  update public.recurring_tasks t set
    title = coalesce(nullif(trim(p ->> 'title'), ''), t.title),
    owner_id = case when p ? 'owner_id' then nullif(p ->> 'owner_id', '')::uuid else t.owner_id end,
    helper_id = case when p ? 'helper_id' then nullif(p ->> 'helper_id', '')::uuid else t.helper_id end,
    rotation = case when p ? 'rotation' then coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p -> 'rotation') x), '{}') else t.rotation end,
    priority = coalesce(nullif(p ->> 'priority', '')::public.task_priority, t.priority),
    definition_of_done = case when p ? 'definition_of_done' then nullif(trim(p ->> 'definition_of_done'), '') else t.definition_of_done end,
    goal = case when p ? 'goal' then nullif(trim(p ->> 'goal'), '') else t.goal end,
    estimate_hours = case when p ? 'estimate_hours' then nullif(p ->> 'estimate_hours', '')::numeric else t.estimate_hours end,
    objective_id = case when p ? 'objective_id' then nullif(p ->> 'objective_id', '')::uuid else t.objective_id end,
    freq = coalesce(nullif(p ->> 'freq', ''), t.freq),
    every = coalesce(nullif(p ->> 'every', '')::int, t.every),
    weekdays = case when p ? 'weekdays' then coalesce((select array_agg(x::smallint) from jsonb_array_elements_text(p -> 'weekdays') x), '{}') else t.weekdays end,
    month_day = case when p ? 'month_day' then nullif(p ->> 'month_day', '')::smallint else t.month_day end,
    time_of_day = coalesce(nullif(p ->> 'time_of_day', '')::time, t.time_of_day),
    starts_on = coalesce(nullif(p ->> 'starts_on', '')::date, t.starts_on),
    ends_on = case when p ? 'ends_on' then nullif(p ->> 'ends_on', '')::date else t.ends_on end,
    status = 'active'
  where t.id = rid;
  if not found then
    raise exception 'Not allowed to change this recurring task';
  end if;

  -- (re)plan the next occurrence from now
  select * into r from public.recurring_tasks where id = rid;
  update public.recurring_tasks set next_due_at = public.recurring_next(r, now()) where id = rid;

  insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, reason, undoable)
  values ('user', me, coalesce(r.owner_id, r.rotation[1], me),
          case when is_new then 'recurring_created' else 'recurring_updated' end,
          format(case when is_new then 'Set up recurring task "%s"' else 'Changed recurring task "%s"' end, r.title),
          format(case when is_new then 'سويت مهمة متكررة «%s»' else 'عدّلت المهمة المتكررة «%s»' end, r.title),
          format('Recurring schedule %s', rid), false);

  perform public.spawn_recurring_tasks(rid);
  return rid;
end;
$$;

-- ─── skip next / pause / resume / stop ────────────────────────────────────────
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
          format('%s recurring task "%s"', initcap(replace(p_action, '_', ' ')), r.title),
          format('%s المهمة المتكررة «%s»',
                 case p_action when 'skip_next' then 'تخطيت المرة الجاية من' when 'pause' then 'وقّفت مؤقتاً' when 'resume' then 'رجّعت' else 'أوقفت' end, r.title),
          case when p_until is not null then format('Until %s', p_until) end, false);
end;
$$;

revoke all on function public.recurring_next(public.recurring_tasks, timestamptz) from public, anon;
revoke all on function public.spawn_recurring_tasks(uuid) from public, anon;
revoke all on function public.upsert_recurring(jsonb) from public, anon;
revoke all on function public.recurring_action(uuid, text, date) from public, anon;
grant execute on function public.recurring_next(public.recurring_tasks, timestamptz) to authenticated;
grant execute on function public.spawn_recurring_tasks(uuid) to authenticated;
grant execute on function public.upsert_recurring(jsonb) to authenticated;
grant execute on function public.recurring_action(uuid, text, date) to authenticated;

select cron.schedule('spawn-recurring', '*/30 * * * *', $$ select public.spawn_recurring_tasks(); $$);
