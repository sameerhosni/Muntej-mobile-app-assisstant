-- Saree3's coffee break: after graduating (or from any tip card) a person can say "thanks, I've got it" and Saree3
-- stops teaching until they call him back from More. Stored as a coach_moments row with key '_paused'.
create or replace function public.coach_pause(p_paused boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_paused then
    insert into public.coach_moments (profile_id, key) values (public.current_profile_id(), '_paused')
    on conflict (profile_id, key) do nothing;
  else
    delete from public.coach_moments where profile_id = public.current_profile_id() and key = '_paused';
  end if;
end;
$$;

revoke all on function public.coach_pause(boolean) from public, anon;
grant execute on function public.coach_pause(boolean) to authenticated;
