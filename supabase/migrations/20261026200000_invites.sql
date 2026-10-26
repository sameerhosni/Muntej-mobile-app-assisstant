-- Smart team setup, step 3: invitations on WhatsApp (and email) with a one-time join link and a personal PIN, and
-- their status per person (sent → opened → joined). The invite function writes them (service role); the phone-auth
-- function trades a link or mobile + PIN for a sign-in once. Only hashes of the link token and the PIN are stored.

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'email')),
  phone text,
  token_hash text unique,
  pin_hash text,
  status text not null default 'sent' check (status in ('sent', 'opened', 'joined', 'failed')),
  error text,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  joined_at timestamptz
);
create index if not exists invites_profile_idx on public.invites (profile_id, sent_at desc);
create index if not exists invites_phone_idx on public.invites (phone) where phone is not null;
alter table public.invites enable row level security;
-- the inviter, the person's managers and the super admin see the status; nobody writes from the app
drop policy if exists invites_read on public.invites;
create policy invites_read on public.invites for select to authenticated
  using (invited_by = public.current_profile_id() or public.is_manager_of(profile_id) or public.is_super_admin());
grant select on public.invites to authenticated;

-- sign-in attempts by mobile (PIN / WhatsApp code): rate limits
create table if not exists public.auth_attempts (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists auth_attempts_key_idx on public.auth_attempts (key, at desc);
alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from authenticated, anon;

-- someone signed in for the first time: their invites are "joined"
create or replace function public.invites_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.user_id is null and new.user_id is not null then
    update public.invites set status = 'joined', joined_at = now() where profile_id = new.id and status <> 'joined';
  end if;
  return new;
end;
$$;
drop trigger if exists invites_joined on public.profiles;
create trigger invites_joined after update of user_id on public.profiles for each row execute function public.invites_joined();
