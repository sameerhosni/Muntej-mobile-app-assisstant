-- Who sees which task, and who may give a task to whom (owner, 8 Nov: "Everyone should see his tasks and his team tasks
-- only and other tasks he is mentioned in and tasks assigned from his side to other teams, and can give tasks to his
-- team and users in the same level of other teams"; admins keep seeing everything: "keep admin all").
--
-- See: yours (owner / giver / helper), your team's (everyone below you), tasks your team gave to others, tasks whose
--      words name you. Admins: the whole company (unchanged).
-- Give: to yourself, to anyone below you, to people at your level in other teams (same number of steps from the top).
--      Admins: anyone. Upward is not allowed. Checked in the database, so the chat, mail, meetings and WhatsApp all follow it.

-- ─── mentions ──────────────────────────────────────────────────────────────────
alter table public.tasks add column if not exists mentioned_ids uuid[] not null default '{}';
create index if not exists tasks_mentioned_ids_idx on public.tasks using gin (mentioned_ids);

-- the teammates a task's words name: a full name (English or Arabic), or a first name nobody else in the company has.
-- Arabic names may carry a joined و / ل / ب / ف («لنوران»).
create or replace function public.task_mentions(p_account uuid, p_text text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with people as (
    select p.id,
           lower(nullif(trim(p.full_name), '')) as en,
           nullif(trim(p.full_name_ar), '') as ar,
           lower(split_part(trim(p.full_name), ' ', 1)) as en1,
           split_part(trim(coalesce(p.full_name_ar, '')), ' ', 1) as ar1
      from public.profiles p
     where p.account_id = p_account and p.status <> 'deleted' and not coalesce(p.hidden, false)
  ), firsts as (
    select en1, count(*) as n from people where length(en1) >= 3 group by en1
  ), firsts_ar as (
    select ar1, count(*) as n from people where length(ar1) >= 3 group by ar1
  )
  select coalesce(array_agg(distinct pe.id), '{}')
    from people pe
   where p_text is not null and (
         (pe.en is not null and length(pe.en) >= 4 and strpos(lower(p_text), pe.en) > 0)
      or (pe.ar is not null and length(pe.ar) >= 4 and strpos(p_text, pe.ar) > 0)
      or (length(pe.en1) >= 3 and (select n from firsts f where f.en1 = pe.en1) = 1
          and lower(p_text) ~ ('(^|[^a-z0-9])' || regexp_replace(pe.en1, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '([^a-z0-9]|$)'))
      or (length(pe.ar1) >= 3 and (select n from firsts_ar f where f.ar1 = pe.ar1) = 1
          and p_text ~ ('(^|[^؀-ۿ])[ولبف]?' || pe.ar1 || '([^؀-ۿ]|$)'))
   );
$$;
revoke all on function public.task_mentions(uuid, text) from public, anon, authenticated;

create or replace function public.tasks_set_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid;
begin
  if tg_op = 'UPDATE' and new.title is not distinct from old.title and new.description is not distinct from old.description then
    return new;
  end if;
  select account_id into acct from public.profiles where id = coalesce(new.assigner_id, new.owner_id);
  new.mentioned_ids := array(
    select m from unnest(public.task_mentions(acct, concat_ws(E'\n', new.title, new.description))) m
     where m is distinct from new.owner_id and m is distinct from new.assigner_id and m is distinct from new.helper_id
  );
  return new;
end;
$$;
drop trigger if exists tasks_set_mentions on public.tasks;
create trigger tasks_set_mentions before insert or update of title, description on public.tasks
  for each row execute function public.tasks_set_mentions();

-- open tasks that already name someone
update public.tasks t
   set mentioned_ids = array(
         select m from unnest(public.task_mentions(p.account_id, concat_ws(E'\n', t.title, t.description))) m
          where m is distinct from t.owner_id and m is distinct from t.assigner_id and m is distinct from t.helper_id)
  from public.profiles p
 where p.id = coalesce(t.assigner_id, t.owner_id) and t.status not in ('done', 'cancelled');

-- ─── who sees a task ───────────────────────────────────────────────────────────
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
         or public.is_manager_of(t.owner_id)                               -- your team's (admins: everyone's)
         or public.is_below(t.assigner_id, public.current_profile_id())    -- your team gave it to someone
         or public.current_profile_id() = any (t.mentioned_ids)            -- it names you
       )
  );
$$;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (
    owner_id = public.current_profile_id()
    or assigner_id = public.current_profile_id()
    or helper_id = public.current_profile_id()
    or public.is_manager_of(owner_id)
    or public.is_below(assigner_id, public.current_profile_id())
    or public.current_profile_id() = any (mentioned_ids)
  );

-- ─── who you may give a task to ────────────────────────────────────────────────
-- in testing first (features.testing): only testers are held to it until the owner approves it (ship --live)
insert into public.features (key, audience, released_at, testing, title, title_ar, benefit, benefit_ar, sort) values
  ('assign_rules', 'all', now(), true, 'Clear who gives tasks to whom',
   'واضح مين يعطي مهام لمين',
   'You give tasks to your team and to people at your level in other teams. You see your team''s tasks, the ones your team handed out, and any task that names you.',
   'تعطي مهام لفريقك وللي في نفس مستواك في الفرق الثانية. وتشوف مهام فريقك، واللي عطاها فريقك لغيرهم، وأي مهمة فيها اسمك.', -22)
on conflict (key) do nothing;

-- steps from the top of the company (the person with no manager is 0)
create or replace function public.org_depth(p_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up(id, d) as (
    select manager_id, 1 from public.profiles where id = p_id and manager_id is not null
    union all
    select p.manager_id, up.d + 1 from public.profiles p join up on p.id = up.id where p.manager_id is not null and up.d < 30
  )
  select coalesce(max(d), 0) from up;
$$;

create or replace function public.can_assign_to(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_target is not null and public.current_profile_id() is not null and (
         p_target = public.current_profile_id()
      or (public.same_account(p_target) and (
              not public.feature_on('assign_rules')
           or public.is_admin()
           or public.is_below(p_target, public.current_profile_id())
           or public.org_depth(p_target) = public.org_depth(public.current_profile_id())
         ))
  );
$$;

-- everyone you may give a task to (the app's pickers)
create or replace function public.assignable_people()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p
   where p.account_id = public.current_account_id() and p.status <> 'deleted' and not coalesce(p.hidden, false)
     and public.can_assign_to(p.id);
$$;

revoke all on function public.org_depth(uuid) from public, anon;
revoke all on function public.can_assign_to(uuid) from public, anon;
revoke all on function public.assignable_people() from public, anon;
grant execute on function public.can_assign_to(uuid) to authenticated;
grant execute on function public.assignable_people() to authenticated;

-- the check itself, whenever someone signed in gives or moves a task (jobs with nobody signed in are not checked)
create or replace function public.tasks_check_assign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_profile_id() is null or new.owner_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then
    return new;
  end if;
  if not public.can_assign_to(new.owner_id) then
    raise exception 'You can give tasks to your team and to people at your level in other teams · تقدر تعطي مهام لفريقك وللي في نفس مستواك في الفرق الثانية'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists tasks_check_assign on public.tasks;
create trigger tasks_check_assign before insert or update of owner_id on public.tasks
  for each row execute function public.tasks_check_assign();
