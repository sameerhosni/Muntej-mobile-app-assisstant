-- Budget is optional (owner, 8 Nov: "Budget should be optional"). A task is clear with who, when and what "done"
-- means; a budget no longer counts toward clarity, so no task asks for one. One trigger scores every task the same way,
-- whichever function wrote it (create_task_with_plan, update_task_from_chat, ...).
create or replace function public.tasks_clarity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.clarity_score := ((case when new.owner_id is not null then 1 else 0 end)
                      + (case when new.due_at is not null then 1 else 0 end)
                      + (case when nullif(trim(coalesce(new.definition_of_done, '')), '') is not null then 1 else 0 end)) * 100 / 3;
  if new.clarity_score = 99 then new.clarity_score := 100; end if;
  return new;
end;
$$;
drop trigger if exists tasks_clarity on public.tasks;
create trigger tasks_clarity before insert or update on public.tasks
  for each row execute function public.tasks_clarity();

-- every task scored the new way
update public.tasks set clarity_score = clarity_score where true;
