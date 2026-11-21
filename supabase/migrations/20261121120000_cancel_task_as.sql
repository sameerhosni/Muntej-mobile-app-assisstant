-- Owner, 21 Nov: «🛑 ألغها» in a WhatsApp late-task card's options (with «↩️ رجّعها»).
-- Reviewer: WhatsApp acts as the seat that built the card, not the company the login last opened in the app
-- (same as set_task_status_as). Service role only.

create or replace function public.cancel_task_as(p_task uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  acct uuid;
begin
  select user_id, account_id into uid, acct from public.profiles where id = p_actor;
  if uid is null then
    raise exception 'No signed-in user behind this profile';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('muntej.acting_account', acct::text, true);
  perform public.cancel_task(p_task);
end;
$$;
revoke all on function public.cancel_task_as(uuid, uuid) from public, anon, authenticated;

create or replace function public.restore_task_as(p_task uuid, p_actor uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  acct uuid;
begin
  select user_id, account_id into uid, acct from public.profiles where id = p_actor;
  if uid is null then
    raise exception 'No signed-in user behind this profile';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('muntej.acting_account', acct::text, true);
  return public.restore_task(p_task);
end;
$$;
revoke all on function public.restore_task_as(uuid, uuid) from public, anon, authenticated;
