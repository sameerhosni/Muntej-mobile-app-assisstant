-- Daily summary: every working morning at the time set in Alerts ("Daily summary" rule, default 08:00 Riyadh),
-- Muntej sends each person their day — managers: team pulse, what needs them, who needs support, their own tasks;
-- employees: what's due/late/sent back, what's waiting for review. Channels come from the rule (push, email, WhatsApp).
-- The daily-summary Edge Function does the work; this table makes sure it goes out once per person per day.

create table if not exists public.daily_summaries (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null, -- Riyadh date
  kind text not null default 'daily' check (kind in ('daily', 'weekly')),
  channels text[] not null default '{}', -- where it actually went
  sent_at timestamptz not null default now(),
  primary key (profile_id, day, kind)
);

alter table public.daily_summaries enable row level security;

create policy daily_summaries_select_own on public.daily_summaries for select to authenticated
  using (profile_id = public.current_profile_id());

-- only the server (service role) writes
revoke insert, update, delete on public.daily_summaries from authenticated, anon;
grant select on public.daily_summaries to authenticated;

-- The rule's default was email only, and email reaches only verified addresses for now: add push to untouched defaults.
update public.notification_prefs
set rules = jsonb_set(rules, '{daily_summary,channels}', '["push", "email"]'::jsonb)
where rules -> 'daily_summary' -> 'channels' = '["email"]'::jsonb;

-- ─── every 15 minutes: send the summaries whose time has come ─────────────────
-- Same Vault secret ('cron_secret') + CRON_SECRET env pattern as send-followups and team-alerts.
select cron.unschedule('daily-summary') where exists (select 1 from cron.job where jobname = 'daily-summary');
select cron.schedule(
  'daily-summary',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://katwiedukkvssuxbjbqf.supabase.co/functions/v1/daily-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
