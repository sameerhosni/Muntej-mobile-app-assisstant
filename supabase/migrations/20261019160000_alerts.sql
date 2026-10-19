-- Risk & achievement alerts: one row per (alert, recipient), written only by the team-alerts Edge Function
-- (service role). People read their own alerts and may mark them read. A 15-minute pg_cron job runs the detector.

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade, -- recipient
  kind text not null check (kind in ('task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star')),
  subject_id uuid references public.profiles (id) on delete set null, -- the person it is about
  task_id uuid references public.tasks (id) on delete cascade,
  title text not null,
  body text not null,
  title_ar text,
  body_ar text,
  dedupe_key text not null unique, -- e.g. task_late:<task>:<recipient>
  sent_push boolean not null default false,
  sent_whatsapp boolean not null default false,
  whatsapp_status text, -- sent | not_configured | not_connected | error
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index alerts_profile_created_idx on public.alerts (profile_id, created_at desc);

alter table public.alerts enable row level security;

create policy alerts_select_own on public.alerts for select to authenticated
  using (profile_id = public.current_profile_id());

create policy alerts_update_own on public.alerts for update to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- No insert/delete policies: only the server (service role) creates alerts.
-- Clients may change read_at only.
revoke insert, delete on public.alerts from authenticated, anon;
revoke update on public.alerts from authenticated, anon;
grant select on public.alerts to authenticated;
grant update (read_at) on public.alerts to authenticated;

-- ─── every-15-minutes detector ────────────────────────────────────────────────
-- Same Vault secret ('cron_secret') + CRON_SECRET env pattern as send-followups.
select cron.schedule(
  'team-alerts',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://katwiedukkvssuxbjbqf.supabase.co/functions/v1/team-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
