-- "Done, forget it": save a captured task + its follow-up plan + the activity entry atomically.
-- security invoker → the caller's RLS policies apply to every insert.

create or replace function public.create_task_with_plan(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  new_id uuid;
  owner uuid := nullif(p ->> 'owner_id', '')::uuid;
  helper uuid := nullif(p ->> 'helper_id', '')::uuid;
  due timestamptz := nullif(p ->> 'due_at', '')::timestamptz;
  dod text := nullif(trim(p ->> 'definition_of_done'), '');
  budget text := nullif(trim(p ->> 'budget'), '');
  clarity smallint;
  owner_name text;
  step jsonb;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if coalesce(trim(p ->> 'title'), '') = '' then
    raise exception 'Title is required';
  end if;

  clarity := (case when owner is not null then 25 else 0 end)
           + (case when due is not null then 25 else 0 end)
           + (case when dod is not null then 25 else 0 end)
           + (case when budget is not null then 25 else 0 end);

  insert into public.tasks (
    title, owner_id, assigner_id, helper_id, workspace_id, start_at, due_at, expected_close_at,
    priority, status, clarity_score, goal, definition_of_done, budget, source, description
  ) values (
    trim(p ->> 'title'), owner, me, helper, nullif(p ->> 'workspace_id', '')::uuid, now(), due, due,
    coalesce(nullif(p ->> 'priority', ''), 'medium')::public.task_priority,
    case when owner is null then 'draft' else 'assigned' end::public.task_status,
    clarity, nullif(trim(p ->> 'goal'), ''), dod, budget,
    coalesce(nullif(p ->> 'source', ''), 'text')::public.task_source,
    nullif(p ->> 'transcript', '')
  )
  returning id into new_id;

  if owner is not null then
    for step in select * from jsonb_array_elements(coalesce(p -> 'followup_plan', '[]'::jsonb)) loop
      insert into public.followups (task_id, recipient_id, scheduled_at, channel, message, status)
      values (
        new_id,
        owner,
        coalesce(nullif(step ->> 'at', '')::timestamptz, now()),
        coalesce(nullif(step ->> 'channel', ''), 'in_app')::public.followup_channel,
        coalesce(step ->> 'message', step ->> 'summary', ''),
        'scheduled'
      );
    end loop;
  end if;

  select full_name into owner_name from public.profiles where id = owner;

  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, reason, undoable, undo_payload)
  values (
    'user', me, coalesce(owner, me), new_id, 'task_created',
    format('Created "%s"%s', trim(p ->> 'title'), coalesce(' for ' || split_part(owner_name, ' ', 1), '')),
    format('سويت مهمة "%s"', trim(p ->> 'title')),
    case when p ->> 'transcript' is not null then format('From: "%s"', left(p ->> 'transcript', 300)) end,
    true,
    jsonb_build_object('task_id', new_id)
  );

  return new_id;
end;
$$;

revoke all on function public.create_task_with_plan(jsonb) from public, anon;
grant execute on function public.create_task_with_plan(jsonb) to authenticated;
