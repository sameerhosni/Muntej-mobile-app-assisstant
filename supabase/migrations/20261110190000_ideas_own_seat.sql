-- QA, 10 Nov: «Send an idea» failed in most runs («ما قدرت أرسلها»): the app sent the profile and account it had loaded,
-- but ideas_add accepts only current_profile_id() — after a seat switch (account_sessions) they differ and the insert
-- is refused. The same happens to anyone with seats in two companies. The database fills them in itself now.
create or replace function public.ideas_fill_seat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_id is null then new.profile_id := public.current_profile_id(); end if;
  if new.account_id is null then
    select account_id into new.account_id from public.profiles where id = new.profile_id;
  end if;
  return new;
end;
$$;
drop trigger if exists ideas_fill_seat on public.ideas;
create trigger ideas_fill_seat before insert on public.ideas for each row execute function public.ideas_fill_seat();
