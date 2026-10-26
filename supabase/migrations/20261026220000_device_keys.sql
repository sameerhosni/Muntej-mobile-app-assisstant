-- Fingerprint / face sign-in (owner, 26 Oct: "login with mobile number and generated passkey"): after a first sign-in
-- the phone keeps a random key behind the phone's biometrics (expo-secure-store); the server keeps only its hash, per
-- device. phone-auth trades the key for a sign-in. People see and remove their own devices.
create table if not exists public.device_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key_hash text not null unique,
  device text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists device_keys_user_idx on public.device_keys (user_id);
alter table public.device_keys enable row level security;
drop policy if exists device_keys_own_read on public.device_keys;
create policy device_keys_own_read on public.device_keys for select to authenticated using (user_id = auth.uid());
drop policy if exists device_keys_own_delete on public.device_keys;
create policy device_keys_own_delete on public.device_keys for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.device_keys to authenticated;
