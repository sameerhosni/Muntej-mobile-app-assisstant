-- create_account: the super admin opens a new company account with its first admin (from the chat:
-- "create an account for Al-Rajhi Trading, admin Ali ali@rajhi.com"). The admin's login is linked right away when the
-- email already has one (link_invited_profile); otherwise on their first sign-in. The chat then emails the invite.
create or replace function public.create_account(p_name text, p_name_ar text, p_admin_name text, p_admin_name_ar text, p_admin_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acc uuid;
  adm uuid;
  email text := lower(nullif(trim(coalesce(p_admin_email, '')), ''));
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can create accounts';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'The account needs a name';
  end if;
  if email is null or email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'The admin needs a valid email';
  end if;
  if exists (select 1 from public.accounts where lower(name) = lower(trim(p_name))) then
    raise exception 'An account with that name already exists';
  end if;

  insert into public.accounts (name, name_ar, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_name_ar, '')), ''), public.current_profile_id())
  returning id into acc;

  insert into public.profiles (account_id, full_name, full_name_ar, email, role, status)
  values (acc, coalesce(nullif(trim(coalesce(p_admin_name, '')), ''), split_part(email, '@', 1)),
          nullif(trim(coalesce(p_admin_name_ar, '')), ''), email, 'admin', 'active')
  returning id into adm;

  insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, undoable)
  values ('user', public.current_profile_id(), public.current_profile_id(), 'account_created',
          format('Created the account "%s" (admin %s)', trim(p_name), email),
          format('أنشأ حساب «%s» (المسؤول %s)', coalesce(nullif(trim(coalesce(p_name_ar, '')), ''), trim(p_name)), email), false);

  return jsonb_build_object('account_id', acc, 'admin_id', adm, 'admin_email', email);
end;
$$;

revoke all on function public.create_account(text, text, text, text, text) from public, anon;
grant execute on function public.create_account(text, text, text, text, text) to authenticated;
