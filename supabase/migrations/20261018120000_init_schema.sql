-- Muntej core schema (Prompt 01). See docs/BRD.md.
-- Profiles are decoupled from auth.users (user_id is nullable) so seed people can exist
-- before they sign in; the first phone sign-in links the auth user to the profile by phone.

-- ─── Enums ────────────────────────────────────────────────────────────────────
create type public.user_role as enum ('manager', 'employee');
create type public.task_status as enum ('draft', 'assigned', 'in_progress', 'blocked', 'submitted', 'returned', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.task_source as enum ('voice', 'text', 'whatsapp', 'email', 'meeting', 'teams', 'slack', 'google_chat', 'jira', 'azure_devops', 'sticky_note', 'agent');
create type public.evidence_type as enum ('file', 'image', 'voice', 'link');
create type public.followup_channel as enum ('push', 'in_app', 'whatsapp', 'email');
create type public.followup_status as enum ('scheduled', 'sent', 'replied', 'skipped', 'cancelled', 'failed');
create type public.review_decision as enum ('approved', 'sent_back');
create type public.decision_type as enum ('extension_request', 'delay_risk', 'ambiguous_reply', 'reassignment', 'priority_question');
create type public.decision_status as enum ('pending', 'approved', 'declined', 'expired');
create type public.actor_type as enum ('muntej', 'user', 'agent');
create type public.agent_autonomy as enum ('ask_first', 'always_run');
create type public.agent_run_status as enum ('running', 'success', 'failed', 'dry_run');
create type public.source_type as enum ('whatsapp', 'email', 'meeting', 'teams', 'slack', 'google_chat', 'jira', 'azure_devops', 'sticky_note');
create type public.source_status as enum ('connected', 'disconnected', 'coming_soon', 'error');

-- ─── updated_at helper ────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── People & workspaces ──────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  -- deferrable so tests can link a profile inside a rolled-back transaction
  user_id uuid unique references auth.users (id) on delete set null deferrable initially deferred,
  phone text unique, -- E.164 digits without '+', e.g. 966500000001 (same as auth.users.phone)
  full_name text not null,
  full_name_ar text,
  role public.user_role not null default 'employee',
  manager_id uuid references public.profiles (id) on delete set null,
  title text,
  title_ar text,
  skills text[] not null default '{}',
  avatar_color text,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  weekly_capacity_hours numeric(5, 1) not null default 40,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_manager_idx on public.profiles (manager_id);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text,
  goal text,
  color text,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_owner_idx on public.workspaces (owner_id);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, profile_id)
);
create index workspace_members_profile_idx on public.workspace_members (profile_id);

-- ─── Tasks ────────────────────────────────────────────────────────────────────
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  workspace_id uuid references public.workspaces (id) on delete set null,
  owner_id uuid references public.profiles (id) on delete set null,
  assigner_id uuid not null references public.profiles (id) on delete cascade,
  helper_id uuid references public.profiles (id) on delete set null,
  start_at timestamptz,
  due_at timestamptz,
  expected_close_at timestamptz,
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'assigned',
  progress smallint not null default 0 check (progress between 0 and 100),
  clarity_score smallint not null default 0 check (clarity_score between 0 and 100),
  goal text,
  definition_of_done text,
  budget text,
  estimate_hours numeric(6, 1),
  source public.task_source not null default 'text',
  source_ref text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_owner_idx on public.tasks (owner_id);
create index tasks_assigner_idx on public.tasks (assigner_id);
create index tasks_helper_idx on public.tasks (helper_id);
create index tasks_workspace_idx on public.tasks (workspace_id);
create index tasks_status_due_idx on public.tasks (status, due_at);

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null,
  owner_id uuid references public.profiles (id) on delete set null,
  done boolean not null default false,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subtasks_task_idx on public.subtasks (task_id);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  uploaded_by uuid references public.profiles (id) on delete set null,
  type public.evidence_type not null,
  title text,
  storage_path text, -- path inside the 'evidence' bucket: <task_id>/<file>
  url text,          -- for type = link
  mime_type text,
  duration_seconds integer,
  created_at timestamptz not null default now()
);
create index evidence_task_idx on public.evidence (task_id);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  recipient_id uuid references public.profiles (id) on delete set null,
  scheduled_at timestamptz not null,
  channel public.followup_channel not null default 'in_app',
  message text not null,
  message_ar text,
  status public.followup_status not null default 'scheduled',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index followups_due_idx on public.followups (status, scheduled_at);
create index followups_task_idx on public.followups (task_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  round smallint not null default 1,
  submitted_by uuid references public.profiles (id) on delete set null,
  submission_note text,
  reviewer_id uuid references public.profiles (id) on delete set null,
  rating smallint check (rating between 1 and 5),
  criteria text[] not null default '{}',
  note text,
  decision public.review_decision,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (task_id, round)
);

-- ─── Decisions & activity ─────────────────────────────────────────────────────
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks (id) on delete cascade,
  manager_id uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null,
  type public.decision_type not null,
  title text not null,
  title_ar text,
  details jsonb not null default '{}',
  recommendation text,
  recommendation_ar text,
  recommendation_reason text,
  status public.decision_status not null default 'pending',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index decisions_manager_status_idx on public.decisions (manager_id, status);

-- Every action Muntej (or a user/agent) takes: who, what, why, undoable.
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_type public.actor_type not null default 'muntej',
  actor_id uuid references public.profiles (id) on delete set null,
  subject_id uuid references public.profiles (id) on delete set null, -- the person it concerns
  task_id uuid references public.tasks (id) on delete cascade,
  agent_run_id uuid,
  action text not null, -- e.g. followup_sent, update_received, task_created, task_closed, meeting_set, escalated
  summary text not null,
  summary_ar text,
  reason text,
  undoable boolean not null default false,
  undo_payload jsonb,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);
create index activity_subject_idx on public.activity_log (subject_id, created_at desc);
create index activity_task_idx on public.activity_log (task_id);
create index activity_created_idx on public.activity_log (created_at desc);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  title text not null,
  title_ar text,
  rating smallint check (rating between 1 and 5),
  achieved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index achievements_profile_idx on public.achievements (profile_id, achieved_at desc);

-- ─── Agents ───────────────────────────────────────────────────────────────────
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  prompt text not null,
  recipe jsonb not null default '{}',
  schedule text, -- cron expression, null for event-based
  autonomy public.agent_autonomy not null default 'ask_first',
  enabled boolean not null default false,
  last_run_at timestamptz,
  run_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agents_owner_idx on public.agents (owner_id);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  status public.agent_run_status not null default 'running',
  dry_run boolean not null default false,
  output jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  undone_at timestamptz
);
create index agent_runs_agent_idx on public.agent_runs (agent_id, started_at desc);

alter table public.activity_log
  add constraint activity_log_agent_run_fk foreign key (agent_run_id) references public.agent_runs (id) on delete set null;

-- ─── Preferences & sources ────────────────────────────────────────────────────
create table public.notification_prefs (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  channels jsonb not null default '{"push": true, "email": true, "whatsapp": false, "teams": false}',
  rules jsonb not null default '{}',
  quiet_hours jsonb not null default '{"enabled": true, "prayer_times": true, "after": "21:00", "friday": true, "ramadan": true}',
  escalation jsonb not null default '{"no_reply_hours": 24, "reminders": 2, "alert_manager": true}',
  updated_at timestamptz not null default now()
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  type public.source_type not null,
  status public.source_status not null default 'disconnected',
  config jsonb not null default '{}',
  today_count integer not null default 0,
  waitlist boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, type)
);

-- ─── updated_at triggers ──────────────────────────────────────────────────────
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger workspaces_updated_at before update on public.workspaces for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger subtasks_updated_at before update on public.subtasks for each row execute function public.set_updated_at();
create trigger agents_updated_at before update on public.agents for each row execute function public.set_updated_at();
create trigger notification_prefs_updated_at before update on public.notification_prefs for each row execute function public.set_updated_at();
create trigger sources_updated_at before update on public.sources for each row execute function public.set_updated_at();

-- ─── Link auth users to profiles on first sign-in ─────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked uuid;
begin
  if new.phone is not null then
    update public.profiles
       set user_id = new.id
     where phone = new.phone and user_id is null
    returning id into linked;
  end if;

  if linked is null then
    insert into public.profiles (user_id, phone, full_name)
    values (new.id, new.phone, coalesce(new.raw_user_meta_data ->> 'full_name', new.phone, 'New user'));
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
