-- Owner, 9 Nov: "why many tasks with no assignee, from where you get it and why not assigned from anyone". Tasks taken
-- from connected tools (email, Google Chat…) showed «من: لسه ما أحد». They keep who sent them in the tool.
alter table public.tasks add column if not exists external_from text;

-- the tasks already made: the sender of the message they came from
update public.tasks t
   set external_from = left(i.sender, 120)
  from public.incoming_items i
 where t.external_from is null
   and i.sender is not null
   and btrim(i.sender) <> ''
   and lower(btrim(i.sender)) not in ('direct message', 'google chat', 'group', 'space', 'unknown')
   and exists (select 1 from jsonb_array_elements(coalesce(i.suggestions, '[]'::jsonb)) s where s ->> 'task_id' = t.id::text);
