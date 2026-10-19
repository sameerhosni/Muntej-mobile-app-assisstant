-- Conversational capture ("talk to Muntej"): one continuous chat per person, tasks created/updated from it.

-- ─── chat_messages ────────────────────────────────────────────────────────────
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  task_id uuid references public.tasks (id) on delete set null,
  action text not null default 'none' check (action in ('none', 'created', 'updated', 'undone')),
  payload jsonb, -- task card snapshot shown under an assistant message
  created_at timestamptz not null default now()
);
create index chat_messages_profile_idx on public.chat_messages (profile_id, created_at desc);

alter table public.chat_messages enable row level security;
create policy chat_select on public.chat_messages for select to authenticated
  using (profile_id = public.current_profile_id());
create policy chat_insert on public.chat_messages for insert to authenticated
  with check (profile_id = public.current_profile_id());

-- ─── update_task_from_chat ────────────────────────────────────────────────────
-- Applies the fields a chat message changed. security invoker → the tasks_update policy decides who may.
-- Re-times scheduled follow-ups when the due date moves and re-targets them when the owner changes.
create or replace function public.update_task_from_chat(p_task uuid, patch jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  old public.tasks;
  new_due timestamptz;
  new_owner uuid;
  owner_locale text;
  ratio double precision;
begin
  select * into old from public.tasks where id = p_task;
  if not found then
    raise exception 'Task not found';
  end if;

  new_due := case when patch ? 'due_at' then nullif(patch ->> 'due_at', '')::timestamptz else old.due_at end;
  new_owner := case when patch ? 'owner_id' then nullif(patch ->> 'owner_id', '')::uuid else old.owner_id end;

  update public.tasks t set
    title = coalesce(nullif(trim(patch ->> 'title'), ''), t.title),
    owner_id = new_owner,
    helper_id = case when patch ? 'helper_id' then nullif(patch ->> 'helper_id', '')::uuid else t.helper_id end,
    due_at = new_due,
    expected_close_at = case when patch ? 'due_at' then new_due else t.expected_close_at end,
    priority = coalesce(nullif(patch ->> 'priority', '')::public.task_priority, t.priority),
    definition_of_done = case when patch ? 'definition_of_done' then nullif(trim(patch ->> 'definition_of_done'), '') else t.definition_of_done end,
    budget = case when patch ? 'budget' then nullif(trim(patch ->> 'budget'), '') else t.budget end,
    goal = case when patch ? 'goal' then nullif(trim(patch ->> 'goal'), '') else t.goal end,
    status = case when t.status = 'draft' and new_owner is not null then 'assigned'::public.task_status else t.status end
  where t.id = p_task;

  update public.tasks t set clarity_score =
      (case when t.owner_id is not null then 25 else 0 end)
    + (case when t.due_at is not null then 25 else 0 end)
    + (case when t.definition_of_done is not null then 25 else 0 end)
    + (case when t.budget is not null then 25 else 0 end)
  where t.id = p_task;

  -- follow-ups go to the new owner
  if new_owner is distinct from old.owner_id and new_owner is not null then
    update public.followups set recipient_id = new_owner where task_id = p_task and status = 'scheduled';
  end if;

  -- due date moved: stretch the remaining plan between now and the new due date
  if new_due is distinct from old.due_at and new_due is not null then
    if old.due_at is not null and old.due_at > now() then
      ratio := extract(epoch from (new_due - now())) / greatest(extract(epoch from (old.due_at - now())), 1);
      update public.followups f
        set scheduled_at = least(now() + (f.scheduled_at - now()) * ratio, new_due)
      where f.task_id = p_task and f.status = 'scheduled' and f.scheduled_at > now();
    end if;
    -- make sure the deliverable is collected on the (new) due date
    if not exists (
      select 1 from public.followups where task_id = p_task and status = 'scheduled' and scheduled_at = new_due
    ) then
      select locale into owner_locale from public.profiles where id = new_owner;
      insert into public.followups (task_id, recipient_id, scheduled_at, channel, message, status)
      values (
        p_task, new_owner, new_due, 'in_app',
        case when owner_locale = 'ar' then 'اليوم موعد التسليم، ارفعه هنا لو سمحت.' else 'It is due today. Please upload it here.' end,
        'scheduled'
      );
    end if;
  end if;

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable, undo_payload)
  values (
    'user', me, coalesce(new_owner, me), p_task, 'task_updated',
    format('Updated "%s"', old.title),
    format('عدّلت "%s"', old.title),
    true,
    jsonb_build_object(
      'task_id', p_task,
      'previous', jsonb_build_object(
        'title', old.title, 'owner_id', old.owner_id, 'helper_id', old.helper_id, 'due_at', old.due_at,
        'priority', old.priority, 'definition_of_done', old.definition_of_done, 'budget', old.budget, 'goal', old.goal
      )
    )
  );
end;
$$;

-- ─── undo_chat_task ───────────────────────────────────────────────────────────
-- "Undo" on a task card: cancel the task and its pending follow-ups. Nothing is deleted.
create or replace function public.undo_chat_task(p_task uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
begin
  select * into t from public.tasks where id = p_task;
  if not found then
    raise exception 'Task not found';
  end if;

  update public.tasks set status = 'cancelled' where id = p_task;
  update public.followups set status = 'cancelled' where task_id = p_task and status = 'scheduled';
  update public.activity_log set undone_at = now()
    where task_id = p_task and action = 'task_created' and undone_at is null;

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable)
  values ('user', me, coalesce(t.owner_id, me), p_task, 'task_undone',
          format('Undid "%s"', t.title), format('تراجعت عن "%s"', t.title), false);
end;
$$;

revoke all on function public.update_task_from_chat(uuid, jsonb) from public, anon;
revoke all on function public.undo_chat_task(uuid) from public, anon;
grant execute on function public.update_task_from_chat(uuid, jsonb) to authenticated;
grant execute on function public.undo_chat_task(uuid) to authenticated;
