-- Objectives: every task can belong to one; an objective is achieved when all its (non-cancelled) tasks are done.
-- Moving an objective's window re-times its open tasks; distribute_tasks spreads open tasks across the window.

create type public.objective_status as enum ('active', 'achieved', 'missed', 'cancelled');

create table public.objectives (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_ar text,
  description text,
  owner_id uuid references public.profiles (id) on delete set null, -- accountable person
  workspace_id uuid references public.workspaces (id) on delete set null,
  start_at timestamptz not null default now(),
  due_at timestamptz not null,
  status public.objective_status not null default 'active',
  achieved_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_at > start_at)
);
create index objectives_owner_idx on public.objectives (owner_id);
create index objectives_status_idx on public.objectives (status, due_at);
create trigger objectives_updated_at before update on public.objectives
  for each row execute function public.set_updated_at();

alter table public.tasks add column objective_id uuid references public.objectives (id) on delete set null;
create index tasks_objective_idx on public.tasks (objective_id);

alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind in (
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
  'objective_achieved', 'objective_at_risk', 'objective_missed'));

-- ─── visibility ───────────────────────────────────────────────────────────────
create or replace function public.can_see_objective(o_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.objectives o
     where o.id = o_id
       and (
         o.owner_id = public.current_profile_id()
         or o.created_by = public.current_profile_id()
         or public.is_manager_of(o.owner_id)
         or public.is_manager_of(o.created_by)
         or exists (select 1 from public.tasks t where t.objective_id = o.id and public.can_see_task(t.id))
       )
  );
$$;
create or replace function public.can_edit_objective(o_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.objectives o
     where o.id = o_id
       and (o.owner_id = public.current_profile_id() or o.created_by = public.current_profile_id()
            or public.is_manager_of(o.owner_id))
  );
$$;
revoke all on function public.can_see_objective(uuid) from public, anon;
revoke all on function public.can_edit_objective(uuid) from public, anon;
grant execute on function public.can_see_objective(uuid) to authenticated;
grant execute on function public.can_edit_objective(uuid) to authenticated;

alter table public.objectives enable row level security;
create policy objectives_select on public.objectives for select to authenticated using (public.can_see_objective(id));
-- writes only through the RPCs below
revoke insert, update, delete on public.objectives from authenticated;

-- ─── re-time one task's due date (and its scheduled follow-ups) ───────────────
create or replace function public.shift_task_due(p_task uuid, new_due timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_due timestamptz;
  ratio double precision;
begin
  select due_at into old_due from public.tasks where id = p_task;
  if new_due is null or old_due is not distinct from new_due then
    return;
  end if;
  update public.tasks set due_at = new_due, expected_close_at = new_due where id = p_task;
  if old_due is not null and old_due > now() and new_due > now() then
    ratio := extract(epoch from (new_due - now())) / greatest(extract(epoch from (old_due - now())), 1);
    update public.followups f
       set scheduled_at = least(now() + (f.scheduled_at - now()) * ratio, new_due)
     where f.task_id = p_task and f.status = 'scheduled' and f.scheduled_at > now();
  end if;
end;
$$;
revoke all on function public.shift_task_due(uuid, timestamptz) from public, anon, authenticated;

-- ─── upsert_objective ─────────────────────────────────────────────────────────
-- p: { id?, title, title_ar?, description?, owner_id?, workspace_id?, start_at?, due_at, status? }. Only keys present change.
-- Changing start/due re-times the objective's open tasks proportionally inside the new window. Returns the id.
create or replace function public.upsert_objective(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  o public.objectives;
  is_new boolean := not (p ? 'id') or nullif(p ->> 'id', '') is null;
  oid uuid;
  new_start timestamptz;
  new_due timestamptz;
  t record;
  moved int := 0;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if not is_new then
    select * into o from public.objectives where id = (p ->> 'id')::uuid;
    if not found then
      raise exception 'Objective not found';
    end if;
    if not public.can_edit_objective(o.id) then
      raise exception 'Only the objective owner, its creator or their manager can change it';
    end if;
  end if;
  if p ? 'owner_id' and nullif(p ->> 'owner_id', '') is not null
     and (p ->> 'owner_id')::uuid <> me and not public.is_manager_of((p ->> 'owner_id')::uuid)
     and not (not is_new and (p ->> 'owner_id')::uuid = o.owner_id) then
    raise exception 'You can only make yourself or people in your team accountable';
  end if;

  new_start := case when p ? 'start_at' then coalesce(nullif(p ->> 'start_at', '')::timestamptz, now())
                    when is_new then now() else o.start_at end;
  new_due := case when p ? 'due_at' then nullif(p ->> 'due_at', '')::timestamptz
                  when is_new then null else o.due_at end;
  if new_due is null then
    raise exception 'An objective needs an end date';
  end if;
  if new_due <= new_start then
    raise exception 'The end date must be after the start date';
  end if;

  if is_new then
    if coalesce(trim(p ->> 'title'), '') = '' then
      raise exception 'Title is required';
    end if;
    insert into public.objectives (title, title_ar, description, owner_id, workspace_id, start_at, due_at, created_by)
    values (trim(p ->> 'title'), nullif(trim(p ->> 'title_ar'), ''), nullif(trim(p ->> 'description'), ''),
            coalesce(nullif(p ->> 'owner_id', '')::uuid, me), nullif(p ->> 'workspace_id', '')::uuid,
            new_start, new_due, me)
    returning id into oid;
  else
    oid := o.id;
    update public.objectives x set
      title = case when p ? 'title' then coalesce(nullif(trim(p ->> 'title'), ''), x.title) else x.title end,
      title_ar = case when p ? 'title_ar' then nullif(trim(p ->> 'title_ar'), '') else x.title_ar end,
      description = case when p ? 'description' then nullif(trim(p ->> 'description'), '') else x.description end,
      owner_id = case when p ? 'owner_id' then nullif(p ->> 'owner_id', '')::uuid else x.owner_id end,
      workspace_id = case when p ? 'workspace_id' then nullif(p ->> 'workspace_id', '')::uuid else x.workspace_id end,
      start_at = new_start,
      due_at = new_due,
      status = case when p ? 'status' then (p ->> 'status')::public.objective_status else x.status end
    where x.id = oid;

    -- window moved → stretch open tasks into it (keep each task's relative position)
    if new_start is distinct from o.start_at or new_due is distinct from o.due_at then
      for t in select id, due_at from public.tasks
                where objective_id = oid and status not in ('done', 'cancelled') and due_at is not null loop
        perform public.shift_task_due(
          t.id,
          least(new_due, new_start + (greatest(t.due_at, o.start_at) - o.start_at)
                * (extract(epoch from (new_due - new_start)) / greatest(extract(epoch from (o.due_at - o.start_at)), 1))));
        moved := moved + 1;
      end loop;
    end if;
  end if;

  insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, reason, undoable)
  select 'user', me, coalesce(owner_id, me), case when is_new then 'objective_created' else 'objective_updated' end,
         format(case when is_new then 'Created objective "%s"' else 'Updated objective "%s"' end, title),
         format(case when is_new then 'سويت الهدف "%s"' else 'عدّلت الهدف "%s"' end, coalesce(title_ar, title)),
         case when moved > 0 then format('Re-timed %s tasks to fit the new dates', moved) end, false
    from public.objectives where id = oid;
  return oid;
end;
$$;

-- ─── link / unlink a task (security invoker → the tasks_update policy decides) ─
create or replace function public.link_task(p_task uuid, p_objective uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_objective is not null and not public.can_see_objective(p_objective) then
    raise exception 'Objective not found';
  end if;
  update public.tasks set objective_id = p_objective where id = p_task;
  if not found then
    raise exception 'You can''t change this task';
  end if;
end;
$$;

-- ─── distribute_tasks: spread open tasks evenly across the objective window ────
create or replace function public.distribute_tasks(p_objective uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.objectives;
  from_t timestamptz;
  n int;
  i int := 0;
  t record;
begin
  select * into o from public.objectives where id = p_objective;
  if not found or not public.can_edit_objective(p_objective) then
    raise exception 'Only the objective owner, its creator or their manager can do this';
  end if;
  from_t := greatest(o.start_at, now());
  if from_t >= o.due_at then
    raise exception 'The objective''s end date has passed; move it first';
  end if;
  select count(*) into n from public.tasks where objective_id = p_objective and status not in ('done', 'cancelled');
  for t in select id from public.tasks
            where objective_id = p_objective and status not in ('done', 'cancelled')
            order by case priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, created_at loop
    i := i + 1;
    -- end of a working day (17:00 Riyadh = 14:00 UTC) on each evenly spaced slot, never past the objective end
    perform public.shift_task_due(
      t.id,
      least(o.due_at, date_trunc('day', from_t + (o.due_at - from_t) * (i::double precision / n)) + interval '14 hours'));
  end loop;
  insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, undoable)
  values ('user', public.current_profile_id(), o.owner_id, 'objective_distributed',
          format('Spread %s tasks across "%s"', n, o.title), format('وزّعت %s مهام على الهدف "%s"', n, coalesce(o.title_ar, o.title)), false);
  return n;
end;
$$;

-- ─── cancel ───────────────────────────────────────────────────────────────────
create or replace function public.cancel_objective(p_objective uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_objective(p_objective) then
    raise exception 'Only the objective owner, its creator or their manager can cancel it';
  end if;
  update public.objectives set status = 'cancelled' where id = p_objective;
  insert into public.activity_log (actor_type, actor_id, action, summary, summary_ar, undoable)
  select 'user', public.current_profile_id(), 'objective_cancelled', format('Cancelled objective "%s"', title),
         format('ألغيت الهدف "%s"', coalesce(title_ar, title)), false from public.objectives where id = p_objective;
end;
$$;

revoke all on function public.upsert_objective(jsonb) from public, anon;
revoke all on function public.link_task(uuid, uuid) from public, anon;
revoke all on function public.distribute_tasks(uuid) from public, anon;
revoke all on function public.cancel_objective(uuid) from public, anon;
grant execute on function public.upsert_objective(jsonb) to authenticated;
grant execute on function public.link_task(uuid, uuid) to authenticated;
grant execute on function public.distribute_tasks(uuid) to authenticated;
grant execute on function public.cancel_objective(uuid) to authenticated;

-- ─── auto status: all tasks done → achieved; reopened → active ────────────────
create or replace function public.refresh_objective(p_objective uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.objectives;
  total int;
  done int;
begin
  if p_objective is null then
    return;
  end if;
  select * into o from public.objectives where id = p_objective;
  if not found or o.status = 'cancelled' then
    return;
  end if;
  select count(*) filter (where status <> 'cancelled'), count(*) filter (where status = 'done')
    into total, done from public.tasks where objective_id = p_objective;
  if total > 0 and done = total and o.status <> 'achieved' then
    update public.objectives set status = 'achieved', achieved_at = now() where id = p_objective;
    insert into public.alerts (profile_id, kind, subject_id, title, body, title_ar, body_ar, dedupe_key)
    select r, 'objective_achieved', o.owner_id, 'Objective achieved 🎉', o.title, 'تحقق الهدف 🎉', coalesce(o.title_ar, o.title),
           format('objective_achieved:%s:%s', o.id, r)
      from unnest(array_remove(array[o.owner_id, o.created_by], null)) r
    on conflict (dedupe_key) do nothing;
    insert into public.activity_log (actor_type, subject_id, action, summary, summary_ar, reason, undoable)
    values ('muntej', o.owner_id, 'objective_achieved', format('Objective "%s" achieved', o.title),
            format('تحقق الهدف "%s"', coalesce(o.title_ar, o.title)), 'All of its tasks are done', false);
  elsif o.status = 'achieved' and (total = 0 or done < total) then
    update public.objectives set status = case when o.due_at < now() then 'missed' else 'active' end::public.objective_status,
                                 achieved_at = null where id = p_objective;
  end if;
end;
$$;
revoke all on function public.refresh_objective(uuid) from public, anon, authenticated;

create or replace function public.tasks_objective_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_objective(new.objective_id);
  if tg_op = 'UPDATE' and old.objective_id is distinct from new.objective_id then
    perform public.refresh_objective(old.objective_id);
  end if;
  return null;
end;
$$;
create trigger tasks_objective_status after insert or update of status, objective_id on public.tasks
  for each row execute function public.tasks_objective_status();
