-- Row Level Security (Prompt 01).
-- Employees see only their own tasks/data; managers see their direct team.
-- Employee-level achievements are visible only to the employee and their direct manager.
-- Edge Functions use the service role and bypass RLS.

-- ─── Helper functions (security definer → no RLS recursion) ──────────────────
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.profiles where user_id = (select auth.uid());
$$;

-- true when the signed-in user is the direct manager of `target`
create or replace function public.is_manager_of(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = target
       and p.manager_id is not null
       and p.manager_id = public.current_profile_id()
  );
$$;

-- self, my manager, my direct reports, and my peers (same manager) — names are needed across the team
create or replace function public.can_see_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select id, manager_id from public.profiles where id = public.current_profile_id())
  select exists (
    select 1
      from me, public.profiles t
     where t.id = target
       and (
         t.id = me.id
         or t.id = me.manager_id
         or t.manager_id = me.id
         or (me.manager_id is not null and t.manager_id = me.manager_id)
       )
  );
$$;

create or replace function public.can_see_task(t_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
     where t.id = t_id
       and (
         t.owner_id = public.current_profile_id()
         or t.assigner_id = public.current_profile_id()
         or t.helper_id = public.current_profile_id()
         or public.is_manager_of(t.owner_id)
       )
  );
$$;

create or replace function public.can_see_workspace(w_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspaces w
     where w.id = w_id
       and (
         w.owner_id = public.current_profile_id()
         or exists (
           select 1 from public.workspace_members m
            where m.workspace_id = w.id and m.profile_id = public.current_profile_id()
         )
       )
  );
$$;

revoke all on function public.current_profile_id() from public, anon;
revoke all on function public.is_manager_of(uuid) from public, anon;
revoke all on function public.can_see_profile(uuid) from public, anon;
revoke all on function public.can_see_task(uuid) from public, anon;
revoke all on function public.can_see_workspace(uuid) from public, anon;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_manager_of(uuid) to authenticated;
grant execute on function public.can_see_profile(uuid) to authenticated;
grant execute on function public.can_see_task(uuid) to authenticated;
grant execute on function public.can_see_workspace(uuid) to authenticated;

-- ─── Grants: signed-in users only (RLS narrows rows); nothing for anon ───────
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- ─── Enable RLS everywhere ────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.evidence enable row level security;
alter table public.followups enable row level security;
alter table public.reviews enable row level security;
alter table public.decisions enable row level security;
alter table public.activity_log enable row level security;
alter table public.achievements enable row level security;
alter table public.agents enable row level security;
alter table public.agent_runs enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.sources enable row level security;

-- ─── profiles ─────────────────────────────────────────────────────────────────
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_see_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = public.current_profile_id())
  with check (id = public.current_profile_id());
create policy profiles_update_reports on public.profiles for update to authenticated
  using (public.is_manager_of(id))
  with check (public.is_manager_of(id));

-- ─── workspaces ───────────────────────────────────────────────────────────────
create policy workspaces_select on public.workspaces for select to authenticated
  using (public.can_see_workspace(id));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (owner_id = public.current_profile_id());
create policy workspaces_update on public.workspaces for update to authenticated
  using (owner_id = public.current_profile_id())
  with check (owner_id = public.current_profile_id());
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (owner_id = public.current_profile_id());

create policy workspace_members_select on public.workspace_members for select to authenticated
  using (public.can_see_workspace(workspace_id));
create policy workspace_members_write on public.workspace_members for all to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = public.current_profile_id()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = public.current_profile_id()));

-- ─── tasks ────────────────────────────────────────────────────────────────────
create policy tasks_select on public.tasks for select to authenticated
  using (
    owner_id = public.current_profile_id()
    or assigner_id = public.current_profile_id()
    or helper_id = public.current_profile_id()
    or public.is_manager_of(owner_id)
  );
create policy tasks_insert on public.tasks for insert to authenticated
  with check (assigner_id = public.current_profile_id());
create policy tasks_update on public.tasks for update to authenticated
  using (
    owner_id = public.current_profile_id()
    or assigner_id = public.current_profile_id()
    or public.is_manager_of(owner_id)
  )
  with check (
    owner_id = public.current_profile_id()
    or assigner_id = public.current_profile_id()
    or public.is_manager_of(owner_id)
  );
create policy tasks_delete on public.tasks for delete to authenticated
  using (assigner_id = public.current_profile_id() or public.is_manager_of(owner_id));

-- ─── task children: visible/writable when the task is ─────────────────────────
create policy subtasks_all on public.subtasks for all to authenticated
  using (public.can_see_task(task_id)) with check (public.can_see_task(task_id));

create policy evidence_select on public.evidence for select to authenticated
  using (public.can_see_task(task_id));
create policy evidence_insert on public.evidence for insert to authenticated
  with check (public.can_see_task(task_id) and uploaded_by = public.current_profile_id());
create policy evidence_delete on public.evidence for delete to authenticated
  using (uploaded_by = public.current_profile_id());

create policy followups_select on public.followups for select to authenticated
  using (public.can_see_task(task_id));
create policy followups_write on public.followups for all to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id
                  and (t.assigner_id = public.current_profile_id() or public.is_manager_of(t.owner_id))))
  with check (exists (select 1 from public.tasks t where t.id = task_id
                  and (t.assigner_id = public.current_profile_id() or public.is_manager_of(t.owner_id))));

create policy reviews_select on public.reviews for select to authenticated
  using (public.can_see_task(task_id));
create policy reviews_insert on public.reviews for insert to authenticated
  with check (public.can_see_task(task_id) and submitted_by = public.current_profile_id());
create policy reviews_update on public.reviews for update to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id
                  and (t.assigner_id = public.current_profile_id() or public.is_manager_of(t.owner_id))))
  with check (reviewer_id = public.current_profile_id());

-- ─── decisions ────────────────────────────────────────────────────────────────
create policy decisions_select on public.decisions for select to authenticated
  using (manager_id = public.current_profile_id() or requested_by = public.current_profile_id());
create policy decisions_insert on public.decisions for insert to authenticated
  with check (requested_by = public.current_profile_id() or manager_id = public.current_profile_id());
create policy decisions_update on public.decisions for update to authenticated
  using (manager_id = public.current_profile_id())
  with check (manager_id = public.current_profile_id());

-- ─── activity_log ─────────────────────────────────────────────────────────────
create policy activity_select on public.activity_log for select to authenticated
  using (
    actor_id = public.current_profile_id()
    or subject_id = public.current_profile_id()
    or public.is_manager_of(subject_id)
    or (task_id is not null and public.can_see_task(task_id))
  );
create policy activity_insert on public.activity_log for insert to authenticated
  with check (actor_type = 'user' and actor_id = public.current_profile_id());
-- undo: the person it concerns or their manager may mark it undone
create policy activity_update on public.activity_log for update to authenticated
  using (subject_id = public.current_profile_id() or public.is_manager_of(subject_id) or actor_id = public.current_profile_id())
  with check (subject_id = public.current_profile_id() or public.is_manager_of(subject_id) or actor_id = public.current_profile_id());

-- ─── achievements: employee + direct manager only ─────────────────────────────
create policy achievements_select on public.achievements for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_manager_of(profile_id));
create policy achievements_insert on public.achievements for insert to authenticated
  with check (public.is_manager_of(profile_id));

-- ─── agents ───────────────────────────────────────────────────────────────────
create policy agents_all on public.agents for all to authenticated
  using (owner_id = public.current_profile_id()) with check (owner_id = public.current_profile_id());
create policy agent_runs_select on public.agent_runs for select to authenticated
  using (exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = public.current_profile_id()));

-- ─── prefs & sources: own rows ────────────────────────────────────────────────
create policy notification_prefs_all on public.notification_prefs for all to authenticated
  using (profile_id = public.current_profile_id()) with check (profile_id = public.current_profile_id());
create policy sources_all on public.sources for all to authenticated
  using (owner_id = public.current_profile_id()) with check (owner_id = public.current_profile_id());
