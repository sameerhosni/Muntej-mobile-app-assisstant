-- Deleting people (owner, 27 Oct): a manager takes their whole branch with them (after a confirmation), several
-- people can be deleted at once, and Restore brings back everyone deleted in the same step.
-- Also: editing or deleting someone whose manager was already deleted failed with "Manager not found"; the manager
-- is now only checked when it actually changes.

CREATE OR REPLACE FUNCTION public.upsert_person_inner(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if ((p ? 'role' and new_role in ('admin', 'super_admin')) or (not is_new and target.role in ('admin', 'super_admin') and p ? 'role' and new_role is distinct from target.role))
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
  if new_manager is not null and (is_new or new_manager is distinct from target.manager_id)
     and not exists (select 1 from public.profiles where id = new_manager and status <> 'deleted') then
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
$function$;


-- people deleted together (a manager and their branch, or a multi-select) share one batch, so Restore brings them all back
alter table public.profiles add column if not exists deleted_batch uuid;

-- delete_people: marks the people (and, with_branch, everyone under them) deleted in one step. Same rights as editing:
-- admins anyone but admins (unless super admin), managers only their own branch, never yourself. Tasks and history
-- stay; it's the same 'deleted' status as before, so nothing is wiped. Returns { deleted, batch }.
create or replace function public.delete_people(ids uuid[], with_branch boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  acct uuid := public.current_account_id();
  admin boolean := public.is_admin();
  super boolean := public.is_super_admin();
  targets uuid[];
  bad text;
  batch uuid := gen_random_uuid();
  n int;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if not public.can_lead() then
    raise exception 'Only managers and admins can change the team';
  end if;
  if me = any (ids) then
    raise exception 'You cannot delete yourself';
  end if;

  with recursive branch(id) as (
    select p.id from public.profiles p where p.id = any (ids) and p.account_id = acct
    union
    select c.id from public.profiles c join branch b on c.manager_id = b.id
     where with_branch and c.account_id = acct and c.status <> 'deleted'
  )
  select coalesce(array_agg(distinct b.id), '{}') into targets
    from branch b join public.profiles p on p.id = b.id
   where p.status <> 'deleted' and p.id <> me;

  if cardinality(targets) = 0 then
    return jsonb_build_object('deleted', 0, 'batch', null);
  end if;

  -- every one of them must be someone you may change
  select coalesce(p.full_name_ar, p.full_name) into bad
    from public.profiles p
   where p.id = any (targets)
     and ((not admin and not public.is_below(p.id, me))
          or (p.role in ('admin', 'super_admin') and not super))
   limit 1;
  if bad is not null then
    raise exception 'You can only change people in your own team (%)', bad;
  end if;

  update public.profiles set status = 'deleted', deleted_batch = batch where id = any (targets);
  get diagnostics n = row_count;

  insert into public.activity_log (id, actor_type, actor_id, subject_id, action, summary, summary_ar, undoable, undo_payload)
  select batch, 'user', me, ids[1], 'people_deleted',
         case when n = 1 then format('Deleted %s', p.full_name) else format('Deleted %s and %s more', p.full_name, n - 1) end,
         case when n = 1 then format('حذفت %s', coalesce(p.full_name_ar, p.full_name))
              else format('حذفت %s و%s غيره', coalesce(p.full_name_ar, p.full_name), n - 1) end,
         true, jsonb_build_object('ids', to_jsonb(targets))
    from public.profiles p where p.id = ids[1];

  return jsonb_build_object('deleted', n, 'batch', batch);
end;
$$;

-- restore_person: brings someone back, plus (with_batch) everyone deleted in the same step as them
create or replace function public.restore_person(person uuid, with_batch boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  acct uuid := public.current_account_id();
  admin boolean := public.is_admin();
  super boolean := public.is_super_admin();
  b uuid;
  n int;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if not public.can_lead() then
    raise exception 'Only managers and admins can change the team';
  end if;
  select deleted_batch into b from public.profiles where id = person and account_id = acct and status = 'deleted';
  if not found then
    raise exception 'Person not found';
  end if;
  if exists (
    select 1 from public.profiles p
     where (p.id = person or (with_batch and b is not null and p.deleted_batch = b))
       and ((not admin and not public.is_below(p.id, me)) or (p.role in ('admin', 'super_admin') and not super))
  ) then
    raise exception 'You can only change people in your own team';
  end if;

  update public.profiles p set status = case when p.user_id is null then 'pending' else 'active' end::public.person_status,
         deleted_batch = null
   where p.account_id = acct and p.status = 'deleted'
     and (p.id = person or (with_batch and b is not null and p.deleted_batch = b));
  get diagnostics n = row_count;

  if b is not null then
    update public.activity_log set undone_at = now() where id = b and undone_at is null;
  end if;
  insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, undoable)
  select 'user', me, person, 'people_restored',
         case when n = 1 then format('Restored %s', p.full_name) else format('Restored %s and %s more', p.full_name, n - 1) end,
         case when n = 1 then format('رجّعت %s', coalesce(p.full_name_ar, p.full_name))
              else format('رجّعت %s و%s غيره', coalesce(p.full_name_ar, p.full_name), n - 1) end,
         false
    from public.profiles p where p.id = person;
  return n;
end;
$$;

grant execute on function public.delete_people(uuid[], boolean) to authenticated;
grant execute on function public.restore_person(uuid, boolean) to authenticated;
revoke execute on function public.delete_people(uuid[], boolean) from anon, public;
revoke execute on function public.restore_person(uuid, boolean) from anon, public;
