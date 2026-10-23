-- Your WhatsApp number (Connect your tools → WhatsApp): voice notes and messages sent to Muntej's WhatsApp number
-- are matched to you by it. Saved on every account this login belongs to, as digits with the country code
-- (05xxxxxxxx → 9665xxxxxxxx). Nobody else can set it for you here.
create or replace function public.set_my_phone(p_phone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  d := regexp_replace(d, '^00', '');
  if d ~ '^05\d{8}$' then
    d := '966' || substr(d, 2);
  elsif d ~ '^5\d{8}$' then
    d := '966' || d;
  end if;
  if d <> '' and d !~ '^\d{9,15}$' then
    raise exception 'PHONE_FORMAT';
  end if;
  update public.profiles set phone = nullif(d, '') where user_id = uid;
  return nullif(d, '');
end;
$$;

revoke all on function public.set_my_phone(text) from public, anon;
grant execute on function public.set_my_phone(text) to authenticated;
