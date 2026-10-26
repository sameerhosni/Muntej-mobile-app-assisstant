-- Owner, 26 Oct: (1) choose which sections Home shows, (2) "What's new" came back after reinstalling the app (the "seen"
-- mark lived only on the phone), (3) Saree3 gets smaller as people get used to him, (4) a push when the Muntej team
-- replies in the support chat (Intercom webhook → supabase/functions/intercom-webhook).

-- per-person app preferences that must survive a reinstall or a new phone (own row only)
create table if not exists public.app_prefs (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  -- Home sections switched off, e.g. {"glance": false, "wins": false}; missing = shown
  home jsonb not null default '{}',
  -- when the What's new page was last opened or its strip closed: only newer features bring the strip back
  whats_new_seen_at timestamptz,
  -- Saree3 getting used to you: {"days": ["2026-10-26", …], "used": ["needs", "add", …]}
  saree3 jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.app_prefs enable row level security;
drop policy if exists app_prefs_own on public.app_prefs;
create policy app_prefs_own on public.app_prefs for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());
grant select, insert, update on public.app_prefs to authenticated;

-- "the Muntej team replied" (support chat): one more alert kind, always pushed
alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind in (
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
  'objective_achieved', 'objective_at_risk', 'objective_missed', 'changed_for_you',
  'task_assigned', 'new_submission', 'decision_waiting', 'no_reply', 'escalated', 'tool_sync', 'new_feature',
  'request_answered', 'ladder_nudge', 'support_reply'
));
