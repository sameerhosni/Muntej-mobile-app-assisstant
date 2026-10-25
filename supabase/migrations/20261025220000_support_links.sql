-- Support chat in the browser (Intercom's in-app screens crash on the owner's phone): the app asks for a one-time
-- link, the support page trades it for who the person is. Used once, valid 15 minutes; only the server reads it.
create table if not exists public.support_links (
  token uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table public.support_links enable row level security;
revoke all on public.support_links from anon, authenticated;
