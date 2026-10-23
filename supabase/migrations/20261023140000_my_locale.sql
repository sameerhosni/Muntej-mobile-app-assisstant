-- The app's language decides the language of everything Muntej sends you (notifications, WhatsApp, emails). The app
-- reports it when you open it or switch language; it was only set once at sign-up, so an Arabic user could still get
-- English notifications. Applies to every account this login belongs to.
create or replace function public.set_my_locale(p_locale text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set locale = p_locale
   where user_id = (select auth.uid()) and p_locale in ('en', 'ar') and locale is distinct from p_locale;
$$;

revoke all on function public.set_my_locale(text) from public, anon;
grant execute on function public.set_my_locale(text) to authenticated;
