-- Team codes you can pick yourself (owner's request): "MNT-SAREE3" instead of a random one. A chosen code is 6–12
-- letters / digits, unique across Muntej, never starting with "MNT" (that prefix is only how codes are shown), and
-- lasts 30 days (a random one: 7). Choosing one cancels your current code.
alter table public.invite_codes drop constraint if exists invite_codes_code_check;
alter table public.invite_codes add constraint invite_codes_code_check check (code ~ '^[A-Z0-9]{6,12}$');

/** "mnt-saree3", "MNT SAREE3", "saree3" → 'SAREE3' (or '' when it can't be a code) */
create or replace function public.invite_norm(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when left(x, 3) = 'MNT' and length(x) between 9 and 15 then substr(x, 4)
           when length(x) between 6 and 12 then x
           else '' end
  from (select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) as x) s;
$$;

create or replace function public.set_invite_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  wanted text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  c public.invite_codes;
begin
  select * into me from public.profiles where id = public.current_profile_id();
  if me.id is null then
    raise exception 'Not signed in';
  end if;
  if me.role = 'employee' then
    raise exception 'Only managers and admins can invite people';
  end if;
  if left(wanted, 3) = 'MNT' and length(wanted) > 12 then
    wanted := substr(wanted, 4);
  end if;
  if wanted !~ '^[A-Z0-9]{6,12}$' or left(wanted, 3) = 'MNT' then
    raise exception 'CODE_FORMAT';
  end if;
  if exists (select 1 from public.invite_codes where code = wanted) then
    raise exception 'CODE_TAKEN';
  end if;
  update public.invite_codes set revoked_at = now()
   where created_by = me.id and account_id = me.account_id and revoked_at is null;
  insert into public.invite_codes (code, account_id, manager_id, created_by, expires_at)
  values (wanted, me.account_id, case when me.hidden then null else me.id end, me.id, now() + interval '30 days')
  returning * into c;
  return jsonb_build_object('code', c.code, 'expires_at', c.expires_at, 'uses', c.uses,
                            'account_name', (select name from public.accounts where id = c.account_id));
end;
$$;

-- random codes never start with MNT either (so "MNT-…" always strips cleanly)
create or replace function public.create_invite_code()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  c public.invite_codes;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  select * into me from public.profiles where id = public.current_profile_id();
  if me.id is null then
    raise exception 'Not signed in';
  end if;
  if me.role = 'employee' then
    raise exception 'Only managers and admins can invite people';
  end if;
  select * into c from public.invite_codes
   where created_by = me.id and account_id = me.account_id and revoked_at is null and expires_at > now() + interval '2 days'
   order by created_at desc limit 1;
  if c.code is null then
    loop
      candidate := (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
                      from generate_series(1, 6));
      exit when left(candidate, 3) <> 'MNT' and not exists (select 1 from public.invite_codes where code = candidate);
    end loop;
    insert into public.invite_codes (code, account_id, manager_id, created_by)
    values (candidate, me.account_id, case when me.hidden then null else me.id end, me.id)
    returning * into c;
  end if;
  return jsonb_build_object(
    'code', c.code,
    'expires_at', c.expires_at,
    'uses', c.uses,
    'account_name', (select name from public.accounts where id = c.account_id));
end;
$$;

revoke all on function public.set_invite_code(text) from public, anon;
grant execute on function public.set_invite_code(text) to authenticated;
