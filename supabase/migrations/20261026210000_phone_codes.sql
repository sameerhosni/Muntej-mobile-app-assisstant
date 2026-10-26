-- Sign-in with a WhatsApp code (phone-auth function): one pending code per mobile, hashed, 10 minutes, 5 tries.
create table if not exists public.phone_codes (
  phone text primary key,
  code_hash text not null,
  tries smallint not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.phone_codes enable row level security;
revoke all on public.phone_codes from authenticated, anon;
