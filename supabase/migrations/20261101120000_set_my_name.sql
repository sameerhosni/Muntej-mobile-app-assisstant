-- Anyone can fix their own name (owner, 1 Nov: an employee's "my name is wrong" in the setup chat failed every time,
-- because names went through upsert_person, which only managers and admins may use). An Arabic name fills the Arabic
-- name, anything else the name; nothing else about the person changes.
create or replace function public.set_my_name(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if length(n) < 2 or length(n) > 80 then
    raise exception 'Name must be 2 to 80 characters';
  end if;
  -- like set_my_phone: on every account this login belongs to
  if n ~ '[؀-ۿ]' then
    update public.profiles set full_name_ar = n where user_id = uid;
  else
    update public.profiles set full_name = n where user_id = uid;
  end if;
end;
$$;

revoke all on function public.set_my_name(text) from public, anon;
grant execute on function public.set_my_name(text) to authenticated;
