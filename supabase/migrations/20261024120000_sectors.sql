-- Sectors: Muntej connects to a long list of tools, so each person picks the field they work in and the tools screen
-- leads with that field's tools (the rest stay one tap away under "More tools"). Asked in Saree3's setup guide,
-- changeable in Settings. An admin or manager can apply theirs to everyone in the account who hasn't picked one.
alter table public.profiles add column if not exists sector text
  check (sector in ('sales', 'tech', 'product', 'operations', 'hr'));

create or replace function public.set_my_sector(p_sector text, p_everyone boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
begin
  if p_sector not in ('sales', 'tech', 'product', 'operations', 'hr') then
    raise exception 'Unknown sector %', p_sector;
  end if;
  select * into me from public.profiles where id = public.current_profile_id();
  if not found then
    raise exception 'No profile';
  end if;
  update public.profiles set sector = p_sector where id = me.id;
  if p_everyone and me.role in ('admin', 'super_admin', 'manager') then
    update public.profiles set sector = p_sector
     where account_id = me.account_id and sector is null and status <> 'deleted';
  end if;
end;
$$;

revoke all on function public.set_my_sector(text, boolean) from public, anon;
grant execute on function public.set_my_sector(text, boolean) to authenticated;
