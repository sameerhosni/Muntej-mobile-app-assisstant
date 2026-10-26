-- Sign in with WhatsApp, nothing to type (owner, 28 Oct: "the WhatsApp OTP journey is not good, couldn't copy the OTP"):
-- the app asks for a one-time key, opens WhatsApp with "دخول منتج #KEY" ready to send to Muntej's number; the webhook
-- sees who sent it (WhatsApp proves the number) and approves the key for that person; the app, waiting, gets signed in.
create table if not exists public.wa_logins (
  nonce text primary key,
  profile_id uuid references public.profiles (id) on delete cascade,
  phone text,
  approved_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.wa_logins enable row level security;
revoke all on public.wa_logins from authenticated, anon;
