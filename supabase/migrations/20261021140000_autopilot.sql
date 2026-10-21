-- Autopilot: Muntej runs the day by itself; people only make decisions.
-- The autopilot Edge Function (every 10 minutes) chases late work, checks on blocked tasks, proposes fixes for
-- overloaded people and unowned tasks, reminds reviewers and auto-approves finished work nobody reviewed in
-- 2 working days. Each manager can switch every behaviour off (autopilot_prefs, own row).

-- ─── per-person switches (the manager's settings apply to their team) ──────────
create table if not exists public.autopilot_prefs (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  -- { chase_late, help_blocked, rebalance, find_owner, incoming_auto, auto_approve } → boolean; missing = on
  rules jsonb not null default '{}',
  chase_reminders smallint not null default 3 check (chase_reminders between 1 and 5),
  auto_approve_days smallint not null default 2 check (auto_approve_days between 1 and 10),
  updated_at timestamptz not null default now()
);
alter table public.autopilot_prefs enable row level security;
drop policy if exists autopilot_prefs_own on public.autopilot_prefs;
create policy autopilot_prefs_own on public.autopilot_prefs for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());
grant select, insert, update on public.autopilot_prefs to authenticated;

-- ─── what Muntej already did (so nothing is done twice) ───────────────────────
-- key examples: chase:<task>:<due>:<n>, chase_decision:<task>:<due>, blocked:<task>:<since>, overload:<person>:<week>,
-- owner:<task>, review_remind:<review>, auto_approve:<review>
create table if not exists public.autopilot_marks (
  key text primary key,
  task_id uuid references public.tasks (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade, -- who it was about
  created_at timestamptz not null default now()
);
create index if not exists autopilot_marks_task_idx on public.autopilot_marks (task_id, created_at desc);
alter table public.autopilot_marks enable row level security;
-- server only (service role); people see what Muntej did through activity_log
revoke all on public.autopilot_marks from authenticated, anon;

-- Reviews already waiting today are left for people to decide (the owner asked to keep the test review requests):
-- auto-approve only applies to work submitted from now on.
insert into public.autopilot_marks (key, task_id, profile_id)
select 'auto_approve:' || r.id, r.task_id, null
from public.reviews r
where r.decision is null
on conflict (key) do nothing;

-- ─── every 10 minutes ─────────────────────────────────────────────────────────
select cron.unschedule('autopilot') where exists (select 1 from cron.job where jobname = 'autopilot');
select cron.schedule(
  'autopilot',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://katwiedukkvssuxbjbqf.supabase.co/functions/v1/autopilot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
