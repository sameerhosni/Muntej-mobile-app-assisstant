-- Tool connections: each person links their own work tools (Microsoft 365 first; Google, Slack, Jira, ClickUp,
-- Trello, Notion, Azure DevOps next). Every 10 minutes the sync-sources Edge Function reads only what's new and
-- relevant (flagged / "Muntej" folder mail, Teams messages that mention you, finished meetings' notes, issues
-- assigned to you …) and passes it to the same intake as pasted text: sure tasks are added, the rest wait in Incoming.
--
-- connections        what the person sees (status, account, last check, found today); own rows, read-only
-- connection_secrets the tool's tokens, AES-GCM encrypted by the server (CONNECTIONS_KEY); never readable by clients
-- oauth_states       one-time sign-in state (10 min) for the OAuth round trip; server only

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('microsoft', 'google', 'slack', 'jira', 'clickup', 'trello', 'notion', 'azure_devops')),
  status text not null default 'connected' check (status in ('connected', 'error')),
  account_label text, -- e.g. the signed-in email
  last_sync_at timestamptz,
  last_error text,
  found_today integer not null default 0,
  found_day date,
  cursor jsonb not null default '{}', -- per-provider "read up to here"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, provider)
);
alter table public.connections enable row level security;
drop policy if exists connections_select_own on public.connections;
create policy connections_select_own on public.connections for select to authenticated
  using (profile_id = public.current_profile_id());
revoke insert, update, delete on public.connections from authenticated, anon;
grant select on public.connections to authenticated;

create table if not exists public.connection_secrets (
  connection_id uuid primary key references public.connections (id) on delete cascade,
  data text not null, -- base64(iv || ciphertext) of the token JSON
  updated_at timestamptz not null default now()
);
alter table public.connection_secrets enable row level security;
revoke all on public.connection_secrets from authenticated, anon;

create table if not exists public.oauth_states (
  state text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  redirect text not null, -- where to send the person back (app deep link or web page)
  verifier text, -- PKCE
  created_at timestamptz not null default now()
);
alter table public.oauth_states enable row level security;
revoke all on public.oauth_states from authenticated, anon;

-- live status on the Sources screen
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'connections') then
    alter publication supabase_realtime add table public.connections;
  end if;
end $$;

-- Create a task as a given person (server only): the sync job has no user session, so it borrows the person's
-- identity for create_task_with_plan (same rules, same activity_log row as if they had added it themselves).
create or replace function public.create_task_as(p jsonb, actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  select user_id into uid from public.profiles where id = actor;
  if uid is null then
    raise exception 'No signed-in user behind this profile';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  return public.create_task_with_plan(p);
end;
$$;
revoke all on function public.create_task_as(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_task_as(jsonb, uuid) to service_role;

-- incoming_items: messages from connected tools carry their own source names
alter table public.incoming_items drop constraint if exists incoming_items_source_check;
alter table public.incoming_items add constraint incoming_items_source_check
  check (source in ('paste', 'share', 'email', 'whatsapp', 'teams', 'slack', 'jira', 'outlook', 'calendar', 'google_chat',
                    'meet', 'gmail', 'clickup', 'trello', 'notion', 'azure_devops'));

-- ─── every 10 minutes: read what's new in every connected tool ────────────────
select cron.unschedule('sync-sources') where exists (select 1 from cron.job where jobname = 'sync-sources');
select cron.schedule(
  'sync-sources',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://katwiedukkvssuxbjbqf.supabase.co/functions/v1/sync-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
-- tidy abandoned sign-ins
select cron.unschedule('oauth-states-cleanup') where exists (select 1 from cron.job where jobname = 'oauth-states-cleanup');
select cron.schedule('oauth-states-cleanup', '17 * * * *', $$ delete from public.oauth_states where created_at < now() - interval '1 hour' $$);
