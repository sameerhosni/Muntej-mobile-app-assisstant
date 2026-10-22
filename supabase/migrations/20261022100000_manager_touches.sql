-- Create & Forget north-star (BRD v1.2, O1): the forget rate = share of handed-off tasks closed with ZERO manager
-- touches after creation. tasks.manager_touches counts the times someone other than the owner stepped in:
--   touch:     edited it (task_updated), reassigned / moved / re-prioritised it (bulk), nudged, sent it back,
--              changed its status for them, answered an escalation (decision_*), added steps, linked it
--   not touch: creating it + filling details in the first 10 minutes (that's capture), approving the finished work
--              (the one decision Create & Forget expects), cancelling / deleting it, anything Muntej did by itself
alter table public.tasks add column if not exists manager_touches integer not null default 0;

create or replace function public.is_manager_touch(p_action text, p_summary text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_action in ('task_updated', 'tasks_bulk_changed', 'nudged', 'sent_back', 'decision_approved',
                      'decision_declined', 'steps_added', 'task_linked_objective') then true
    -- status changes: closing / approving is the expected decision; anything else (in progress, blocked, sent back) is a touch
    when p_action = 'task_status_changed' then coalesce(p_summary, '') not like 'Closed %'
    else false
  end;
$$;

create or replace function public.count_manager_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  if new.actor_type <> 'user' or new.actor_id is null or not public.is_manager_touch(new.action, new.summary) then
    return new;
  end if;
  if new.action = 'tasks_bulk_changed' then
    select array_agg((x ->> 'task_id')::uuid) into ids from jsonb_array_elements(coalesce(new.undo_payload -> 'tasks', '[]'::jsonb)) x;
  else
    ids := array[new.task_id];
  end if;
  if ids is null then
    return new;
  end if;
  update public.tasks t
     set manager_touches = t.manager_touches + 1
   where t.id = any(ids)
     and t.owner_id is distinct from new.actor_id
     and new.created_at > t.created_at + interval '10 minutes';
  return new;
end;
$$;

drop trigger if exists count_manager_touch on public.activity_log;
create trigger count_manager_touch after insert on public.activity_log for each row execute function public.count_manager_touch();

-- backfill from the history we already have
with touches as (
  select l.task_id as id, l.actor_id, l.created_at from public.activity_log l
   where l.actor_type = 'user' and l.task_id is not null and public.is_manager_touch(l.action, l.summary)
  union all
  select (x ->> 'task_id')::uuid, l.actor_id, l.created_at from public.activity_log l, jsonb_array_elements(l.undo_payload -> 'tasks') x
   where l.actor_type = 'user' and l.action = 'tasks_bulk_changed'
)
update public.tasks t set manager_touches = c.n
  from (
    select tc.id, count(*) n from touches tc join public.tasks tt on tt.id = tc.id
     where tc.actor_id is distinct from tt.owner_id and tc.created_at > tt.created_at + interval '10 minutes'
     group by tc.id
  ) c
 where c.id = t.id;
