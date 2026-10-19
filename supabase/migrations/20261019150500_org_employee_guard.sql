-- upsert_person: an employee with nobody reporting to them may only edit their own skills/experience
-- (anyone who already leads people — role manager or with reports — can manage their branch).
create or replace function public.can_lead()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
      or exists (select 1 from public.profiles where id = public.current_profile_id() and role = 'manager')
      or exists (select 1 from public.profiles where manager_id = public.current_profile_id() and status <> 'deleted');
$$;
revoke all on function public.can_lead() from public, anon;
grant execute on function public.can_lead() to authenticated;

-- wrap the existing function: same signature, guard first
alter function public.upsert_person(jsonb) rename to upsert_person_inner;
revoke all on function public.upsert_person_inner(jsonb) from public, anon, authenticated;

create or replace function public.upsert_person(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
begin
  if me is not null and not public.can_lead()
     and (not (p ? 'id') or nullif(p ->> 'id', '') is null or (p ->> 'id')::uuid <> me) then
    raise exception 'Only managers and admins can change the team';
  end if;
  return public.upsert_person_inner(p);
end;
$$;
revoke all on function public.upsert_person(jsonb) from public, anon;
grant execute on function public.upsert_person(jsonb) to authenticated;
