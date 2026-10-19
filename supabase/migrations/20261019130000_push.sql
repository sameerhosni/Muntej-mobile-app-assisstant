-- Push notifications (Android first): device tokens + a every-minute job that sends due follow-ups.

-- ─── push_tokens ──────────────────────────────────────────────────────────────
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique, -- Expo push token, e.g. ExponentPushToken[...]
  platform text not null check (platform in ('android', 'ios')),
  device_name text,
  updated_at timestamptz not null default now()
);
create index push_tokens_profile_idx on public.push_tokens (profile_id);

alter table public.push_tokens enable row level security;
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- Upsert this device's token for the signed-in person. security definer so a phone that switches accounts
-- moves its token to the new person (the old row belongs to someone else and RLS would hide it).
create or replace function public.save_push_token(p_token text, p_platform text, p_device_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[.+\]$' then
    raise exception 'Invalid push token';
  end if;
  insert into public.push_tokens (profile_id, token, platform, device_name, updated_at)
  values (me, p_token, p_platform, p_device_name, now())
  on conflict (token) do update
    set profile_id = excluded.profile_id, platform = excluded.platform,
        device_name = excluded.device_name, updated_at = now();
end;
$$;

revoke all on function public.save_push_token(text, text, text) from public, anon;
grant execute on function public.save_push_token(text, text, text) to authenticated;

-- ─── every-minute follow-up sender ────────────────────────────────────────────
-- The shared secret lives in Vault (name 'cron_secret', created outside migrations so it never enters git)
-- and in the send-followups function env (CRON_SECRET).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'send-followups',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://katwiedukkvssuxbjbqf.supabase.co/functions/v1/send-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
