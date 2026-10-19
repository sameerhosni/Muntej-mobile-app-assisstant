-- Org structure, part 2: person details, branch-wide permissions and the upsert_person RPC.
-- Roles: super_admin & admin see/manage everyone (only a super_admin touches admin roles); a manager manages their
-- whole branch (any depth); an employee edits only their own skills/experience. Everyone can see the tree.

-- ─── person details ───────────────────────────────────────────────────────────
alter table public.profiles
  add column years_experience numeric(4, 1),
  add column skills_detail jsonb not null default '[]'::jsonb, -- [{ name, level 1-5, years, notes }]
  add column status public.person_status not null default 'active',
  add column whatsapp_connected boolean not null default false,
  add column telegram_connected boolean not null default false,
  add column telegram_handle text;

-- backfill detailed skills from the existing skill names (level 3 = solid, unknown years)
update public.profiles
   set skills_detail = coalesce(
     (select jsonb_agg(jsonb_build_object('name', s, 'level', 3, 'years', null, 'notes', null)) from unnest(skills) s),
     '[]'::jsonb)
 where skills_detail = '[]'::jsonb and coalesce(array_length(skills, 1), 0) > 0;

-- a person's first sign-in turns them from pending into active
create or replace function public.activate_on_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.user_id is null and new.user_id is not null and new.status = 'pending' then
    new.status := 'active';
  end if;
  return new;
end;
$$;
create trigger profiles_activate_on_link before update of user_id on public.profiles
  for each row execute function public.activate_on_link();

-- ─── helpers ──────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
     where id = public.current_profile_id() and role in ('admin', 'super_admin') and status <> 'deleted'
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
     where id = public.current_profile_id() and role = 'super_admin' and status <> 'deleted'
  );
$$;

-- true when `target` sits anywhere below `boss` in the tree (UNION stops on cycles)
create or replace function public.is_below(target uuid, boss uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up(id) as (
    select manager_id from public.profiles where id = target
    union
    select p.manager_id from public.profiles p join up on p.id = up.id where p.manager_id is not null
  )
  select boss is not null and exists (select 1 from up where id = boss);
$$;

-- my whole branch (any depth) — or everyone when I'm an admin.
-- Existing policies call is_manager_of(), so redefining it gives managers branch-wide reach everywhere
-- (tasks, follow-ups, activity, reviews…) and admins the whole company.
create or replace function public.is_manager_of(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target is not null and (public.is_admin() or public.is_below(target, public.current_profile_id()));
$$;

-- everyone in the company can see the org tree (task visibility still follows the branch rules)
create or replace function public.can_see_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_profile_id() is not null and exists (select 1 from public.profiles where id = target);
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.is_below(uuid, uuid) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_below(uuid, uuid) to authenticated;

-- people are changed only through upsert_person (it enforces the role rules)
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_update_reports on public.profiles;

-- ─── upsert_person ────────────────────────────────────────────────────────────
-- p: { id?, full_name, full_name_ar?, title?, title_ar?, phone?, email?, role?, manager_id? (null = top level),
--      weekly_capacity_hours?, years_experience?, skills_detail?, whatsapp_connected?, telegram_connected?,
--      telegram_handle?, status? }. Only keys present in p are changed. Returns the person's id.
create or replace function public.upsert_person(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  admin boolean := public.is_admin();
  super boolean := public.is_super_admin();
  target public.profiles;
  is_new boolean := not (p ? 'id') or nullif(p ->> 'id', '') is null;
  tid uuid;
  new_role public.user_role;
  new_manager uuid;
  self_only boolean;
  skills_names text[];
  k text;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  if not is_new then
    select * into target from public.profiles where id = (p ->> 'id')::uuid;
    if not found then
      raise exception 'Person not found';
    end if;
  end if;

  new_role := case when p ? 'role' then (p ->> 'role')::public.user_role
                   when is_new then 'employee' else target.role end;
  new_manager := case when p ? 'manager_id' then nullif(p ->> 'manager_id', '')::uuid
                      when is_new then me else target.manager_id end;

  -- ── who may do this ──
  self_only := not is_new and target.id = me and not admin;
  if self_only then
    -- an employee (or a manager on themself) may only change their own skills / experience
    for k in select jsonb_object_keys(p) loop
      if k not in ('id', 'skills_detail', 'years_experience') then
        raise exception 'You can only change your own skills and experience';
      end if;
    end loop;
  elsif not admin then
    if is_new then
      if new_manager is null or not (new_manager = me or public.is_below(new_manager, me)) then
        raise exception 'You can only add people under yourself or your team';
      end if;
    elsif not public.is_below(target.id, me) then
      raise exception 'You can only change people in your own team';
    end if;
    if p ? 'manager_id' and (new_manager is null or not (new_manager = me or public.is_below(new_manager, me))) then
      raise exception 'You can only move people within your own team';
    end if;
  end if;

  if (new_role in ('admin', 'super_admin') or (not is_new and target.role in ('admin', 'super_admin') and p ? 'role'))
     and not super then
    raise exception 'Only a super admin can give or change admin roles';
  end if;
  if not is_new and target.role in ('admin', 'super_admin') and not super and target.id <> me then
    raise exception 'Only a super admin can change an admin';
  end if;

  -- ── tree must stay a tree ──
  if not is_new and new_manager is not null and (new_manager = target.id or public.is_below(new_manager, target.id)) then
    raise exception 'Someone cannot report to themselves or to a person below them';
  end if;
  if new_manager is not null and not exists (select 1 from public.profiles where id = new_manager and status <> 'deleted') then
    raise exception 'Manager not found';
  end if;

  if p ? 'skills_detail' then
    select coalesce(array_agg(trim(s ->> 'name')) filter (where coalesce(trim(s ->> 'name'), '') <> ''), '{}')
      into skills_names from jsonb_array_elements(p -> 'skills_detail') s;
  end if;

  if is_new then
    if coalesce(trim(p ->> 'full_name'), '') = '' then
      raise exception 'Name is required';
    end if;
    insert into public.profiles (
      full_name, full_name_ar, title, title_ar, phone, email, role, manager_id, weekly_capacity_hours,
      years_experience, skills_detail, skills, whatsapp_connected, telegram_connected, telegram_handle, status, locale
    ) values (
      trim(p ->> 'full_name'), nullif(trim(p ->> 'full_name_ar'), ''), nullif(trim(p ->> 'title'), ''),
      nullif(trim(p ->> 'title_ar'), ''), nullif(regexp_replace(coalesce(p ->> 'phone', ''), '[^0-9]', '', 'g'), ''),
      nullif(lower(trim(p ->> 'email')), ''), new_role, new_manager,
      coalesce((p ->> 'weekly_capacity_hours')::numeric, 40), (p ->> 'years_experience')::numeric,
      coalesce(p -> 'skills_detail', '[]'::jsonb), coalesce(skills_names, '{}'),
      coalesce((p ->> 'whatsapp_connected')::boolean, false), coalesce((p ->> 'telegram_connected')::boolean, false),
      nullif(trim(p ->> 'telegram_handle'), ''), coalesce((p ->> 'status')::public.person_status, 'pending'),
      coalesce(nullif(p ->> 'locale', ''), 'ar')
    )
    returning id into tid;
  else
    tid := target.id;
    update public.profiles t set
      full_name = case when p ? 'full_name' then coalesce(nullif(trim(p ->> 'full_name'), ''), t.full_name) else t.full_name end,
      full_name_ar = case when p ? 'full_name_ar' then nullif(trim(p ->> 'full_name_ar'), '') else t.full_name_ar end,
      title = case when p ? 'title' then nullif(trim(p ->> 'title'), '') else t.title end,
      title_ar = case when p ? 'title_ar' then nullif(trim(p ->> 'title_ar'), '') else t.title_ar end,
      phone = case when p ? 'phone' then nullif(regexp_replace(coalesce(p ->> 'phone', ''), '[^0-9]', '', 'g'), '') else t.phone end,
      email = case when p ? 'email' then nullif(lower(trim(p ->> 'email')), '') else t.email end,
      role = new_role,
      manager_id = new_manager,
      weekly_capacity_hours = case when p ? 'weekly_capacity_hours' then coalesce((p ->> 'weekly_capacity_hours')::numeric, t.weekly_capacity_hours) else t.weekly_capacity_hours end,
      years_experience = case when p ? 'years_experience' then (p ->> 'years_experience')::numeric else t.years_experience end,
      skills_detail = case when p ? 'skills_detail' then coalesce(p -> 'skills_detail', '[]'::jsonb) else t.skills_detail end,
      skills = case when p ? 'skills_detail' then coalesce(skills_names, '{}') else t.skills end,
      whatsapp_connected = case when p ? 'whatsapp_connected' then coalesce((p ->> 'whatsapp_connected')::boolean, false) else t.whatsapp_connected end,
      telegram_connected = case when p ? 'telegram_connected' then coalesce((p ->> 'telegram_connected')::boolean, false) else t.telegram_connected end,
      telegram_handle = case when p ? 'telegram_handle' then nullif(trim(p ->> 'telegram_handle'), '') else t.telegram_handle end,
      status = case when p ? 'status' then (p ->> 'status')::public.person_status else t.status end
    where t.id = tid;
  end if;

  insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, undoable)
  select 'user', me, tid, case when is_new then 'person_added' else 'person_updated' end,
         format(case when is_new then 'Added %s to the team' else 'Updated %s' end, full_name),
         format(case when is_new then 'أضفت %s للفريق' else 'عدّلت بيانات %s' end, coalesce(full_name_ar, full_name)),
         false
    from public.profiles where id = tid;

  return tid;
exception
  when unique_violation then
    raise exception 'That email or mobile number is already used by someone else';
end;
$$;

revoke all on function public.upsert_person(jsonb) from public, anon;
grant execute on function public.upsert_person(jsonb) to authenticated;

-- the seed manager is the company's super admin
update public.profiles set role = 'super_admin' where email = 's.hosni@t2.sa' and role = 'manager';
update public.profiles set years_experience = v.y
  from (values ('s.hosni@t2.sa', 12), ('s.hosni+faisal@t2.sa', 6), ('s.hosni+abdullah@t2.sa', 8),
               ('s.hosni+noura@t2.sa', 5), ('s.hosni+khalid@t2.sa', 9), ('s.hosni+saad@t2.sa', 4),
               ('s.hosni+maha@t2.sa', 5)) as v(email, y)
 where profiles.email = v.email and profiles.years_experience is null;
