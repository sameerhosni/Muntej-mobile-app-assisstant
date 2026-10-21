-- Two-way tool sync. Per connection, two independent switches: bring tasks in (tool → Muntej) and send tasks out
-- (Muntej → tool, into the list / project the person picks). Every linked task keeps its status in step both ways
-- (done here closes it there, closed there makes it done here) and title / due date changes follow.
-- task_links remembers which Muntej task is which item in which tool (also drives the tool tag on tasks).

alter table public.connections
  add column if not exists import_on boolean not null default true,
  add column if not exists export_on boolean not null default false,
  -- { id, name } of the ClickUp list / Jira project / Trello list, + since: only tasks from then on go out
  add column if not exists export_target jsonb;

create table if not exists public.task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  connection_id uuid not null references public.connections (id) on delete cascade,
  provider text not null,
  external_id text not null,
  external_url text,
  direction text not null check (direction in ('in', 'out')), -- came from the tool / was sent to it
  closed_there boolean not null default false,
  synced_at timestamptz not null default now(), -- last time title / due / status were made equal
  created_at timestamptz not null default now(),
  unique (connection_id, external_id),
  unique (task_id, connection_id)
);
create index if not exists task_links_task_idx on public.task_links (task_id);

alter table public.task_links enable row level security;
drop policy if exists task_links_select on public.task_links;
create policy task_links_select on public.task_links for select to authenticated
  using (public.can_see_task(task_id));
revoke insert, update, delete on public.task_links from authenticated, anon;
grant select on public.task_links to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'task_links') then
    alter publication supabase_realtime add table public.task_links;
  end if;
end $$;

-- one grouped "what moved between Muntej and <tool>" notification per check
alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind in (
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
  'objective_achieved', 'objective_at_risk', 'objective_missed', 'changed_for_you',
  'task_assigned', 'new_submission', 'decision_waiting', 'no_reply', 'escalated', 'tool_sync'
));
