-- Reading tasks, faster (owner, 8 Nov: "most of actions takes a lot of time"). The tasks rule asked "who am I, am I an
-- admin, is this person below me" again for every row: about 2 ms a task, 200 ms for a hundred. Now those answers are
-- worked out once per query (a list of ids) and each row only looks itself up in it. Same rule as before
-- (20261108200000_who_sees_who_assigns): yours, your team's (admins: the whole company), what your team handed out,
-- and tasks that name you.

-- everyone below you (any depth)
create or replace function public.my_branch_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with recursive down(id, d) as (
    select p.id, 1 from public.profiles p where p.manager_id = public.current_profile_id()
    union
    select p.id, down.d + 1 from public.profiles p join down on p.manager_id = down.id where down.d < 30
  )
  select coalesce(array_agg(distinct id), '{}') from down;
$$;

-- whose tasks you see as a manager: your branch, or the whole company for admins
create or replace function public.my_task_owner_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_admin()
    then (select coalesce(array_agg(p.id), '{}') from public.profiles p where p.account_id = public.current_account_id())
    else public.my_branch_ids() end;
$$;

revoke all on function public.my_branch_ids() from public, anon;
revoke all on function public.my_task_owner_ids() from public, anon;
grant execute on function public.my_branch_ids() to authenticated;
grant execute on function public.my_task_owner_ids() to authenticated;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (
    owner_id = (select public.current_profile_id())
    or assigner_id = (select public.current_profile_id())
    or helper_id = (select public.current_profile_id())
    -- coalesce(...) keeps it one array worked out once (a bare subquery would be read as a list of rows)
    or owner_id = any (coalesce((select public.my_task_owner_ids()), '{}'::uuid[]))
    or assigner_id = any (coalesce((select public.my_branch_ids()), '{}'::uuid[]))
    or (select public.current_profile_id()) = any (mentioned_ids)
  );
