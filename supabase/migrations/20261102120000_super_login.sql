-- Super admin signs in with a username + password and a code sent to their email (owner, 2 Nov: "hardcoded like
-- supermuntej … so I can use my emails in my other accounts"). The sign-in user gets an internal address that no
-- email or code can reach, so only the admin-login function (password, then emailed code) opens it.
-- Server-only: no client role can read or write this table.
create table if not exists public.super_logins (
  username text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  password_hash text not null,
  notify_email text not null,
  notify_phone text,
  code_hash text,
  code_expires_at timestamptz,
  code_tries int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.super_logins enable row level security;
revoke all on public.super_logins from anon, authenticated;
