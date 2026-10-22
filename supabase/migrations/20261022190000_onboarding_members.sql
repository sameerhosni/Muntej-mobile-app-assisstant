-- Onboarding for invited people too. onboarding.kind: 'owner' = signed up and owns a new account (the full tour:
-- name, company, demo, first task, team, hand-off); 'member' = invited into someone's account (the short tour: who
-- Saree3 is, answering a check-in, adding proof). A member's row is made when their login is linked to the invite.
alter table public.onboarding add column if not exists kind text not null default 'owner' check (kind in ('owner', 'member'));

create or replace function public.member_onboarding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- an invited profile just got its login: give it the short tour (once)
  if new.user_id is not null and old.user_id is null and new.role not in ('admin', 'super_admin') and not new.hidden then
    insert into public.onboarding (profile_id, kind) values (new.id, 'member') on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists member_onboarding on public.profiles;
create trigger member_onboarding after update of user_id on public.profiles for each row execute function public.member_onboarding();

-- an invite for an email that already has a login is linked at insert time (link_invited_profile): same tour
create or replace function public.member_onboarding_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and new.role not in ('admin', 'super_admin') and not new.hidden then
    insert into public.onboarding (profile_id, kind) values (new.id, 'member') on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists member_onboarding_insert on public.profiles;
create trigger member_onboarding_insert after insert on public.profiles for each row execute function public.member_onboarding_insert();
