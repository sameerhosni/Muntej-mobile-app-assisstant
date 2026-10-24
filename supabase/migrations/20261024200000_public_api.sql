-- Public API (microservice for other systems: ERP / CRM / HR, Odoo, Zoho, internal tools). See docs/api/README.md.
--   api_keys            per-account keys; only the SHA-256 hash is stored; created by an admin (shown once)
--   api_idempotency     POST results kept 24 h per (key, Idempotency-Key): a retried request gets the same answer
--   api_rate            requests per key per minute (the public-api function refuses above the limit)
--   webhooks            outbound URLs per account + the events they want; signed with HMAC-SHA256 (secret)
--   webhook_events      what happened (task.created / task.updated / task.done / decision.created / decision.resolved)
--   webhook_deliveries  one row per (webhook, event): sent by the webhook-dispatch function every minute, retried
--                       with backoff (1 m, 5 m, 30 m, 2 h, 12 h), "failed" after 6 tries
-- The API acts as the admin who created the key (create_task_as / upsert_person_as), so every existing rule applies.

create extension if not exists pgcrypto with schema extensions;

-- ─── keys ─────────────────────────────────────────────────────────────────────
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  prefix text not null,                     -- first characters, to recognise a key in lists ("mjk_3f9a…")
  key_hash text not null unique,            -- sha256(key) hex
  scopes text[] not null default array['tasks:read', 'tasks:write', 'people:read', 'people:write', 'decisions:read', 'messages:write', 'webhooks:write'],
  actor_id uuid not null references public.profiles (id) on delete cascade, -- the admin the API acts as
  rate_per_min integer not null default 120,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_keys_account_idx on public.api_keys (account_id);
alter table public.api_keys enable row level security;
drop policy if exists api_keys_admin_read on public.api_keys;
create policy api_keys_admin_read on public.api_keys for select to authenticated
  using (account_id = public.current_account_id() and public.is_admin());

-- an admin makes a key for their account; the key is returned ONCE (only its hash is kept)
create or replace function public.create_api_key(p_name text, p_scopes text[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  raw text;
  row_id uuid;
begin
  select * into me from public.profiles where id = public.current_profile_id();
  if not found or me.role not in ('admin', 'super_admin') then
    raise exception 'Only admins can create API keys';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Give the key a name (e.g. "Odoo")';
  end if;
  raw := 'mjk_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.api_keys (account_id, name, prefix, key_hash, scopes, actor_id)
  values (me.account_id, trim(p_name), left(raw, 10), encode(extensions.digest(raw, 'sha256'), 'hex'),
          coalesce(p_scopes, array['tasks:read', 'tasks:write', 'people:read', 'people:write', 'decisions:read', 'messages:write', 'webhooks:write']),
          me.id)
  returning id into row_id;
  insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, undoable)
  values ('user', me.id, me.id, 'api_key_created', format('Created API key "%s"', trim(p_name)), format('أنشأ مفتاح API «%s»', trim(p_name)), false);
  return jsonb_build_object('id', row_id, 'key', raw, 'prefix', left(raw, 10));
end;
$$;
revoke all on function public.create_api_key(text, text[]) from public, anon;
grant execute on function public.create_api_key(text, text[]) to authenticated;

create or replace function public.revoke_api_key(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where id = public.current_profile_id();
  if not found or me.role not in ('admin', 'super_admin') then
    raise exception 'Only admins can revoke API keys';
  end if;
  update public.api_keys set revoked_at = now() where id = p_id and account_id = me.account_id and revoked_at is null;
  if not found then
    raise exception 'Key not found';
  end if;
end;
$$;
revoke all on function public.revoke_api_key(uuid) from public, anon;
grant execute on function public.revoke_api_key(uuid) to authenticated;

-- ─── idempotency + rate ───────────────────────────────────────────────────────
create table if not exists public.api_idempotency (
  key_id uuid not null references public.api_keys (id) on delete cascade,
  idem_key text not null,
  status integer not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (key_id, idem_key)
);
alter table public.api_idempotency enable row level security; -- server only

create table if not exists public.api_rate (
  key_id uuid not null references public.api_keys (id) on delete cascade,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key_id, window_start)
);
alter table public.api_rate enable row level security; -- server only

-- one call per request: +1 for this minute, returns the count (the function compares it with rate_per_min)
create or replace function public.api_hit(p_key uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.api_rate (key_id, window_start, count) values (p_key, date_trunc('minute', now()), 1)
  on conflict (key_id, window_start) do update set count = public.api_rate.count + 1
  returning count;
$$;
revoke all on function public.api_hit(uuid) from public, anon, authenticated;
grant execute on function public.api_hit(uuid) to service_role;

-- ─── acting as the key's admin ────────────────────────────────────────────────
create or replace function public.upsert_person_as(p jsonb, actor uuid)
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
  return public.upsert_person(p);
end;
$$;
revoke all on function public.upsert_person_as(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.upsert_person_as(jsonb, uuid) to service_role;

-- messages sent in through the API wait in "Your tools" like any other tool
alter table public.incoming_items drop constraint if exists incoming_items_source_check;
alter table public.incoming_items add constraint incoming_items_source_check
  check (source in ('paste', 'share', 'meeting', 'email', 'whatsapp', 'teams', 'slack', 'jira', 'outlook', 'calendar',
                    'google_chat', 'meet', 'gmail', 'clickup', 'trello', 'notion', 'azure_devops', 'api'));

-- ─── webhooks ─────────────────────────────────────────────────────────────────
create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  url text not null check (url ~ '^https://'),
  secret text not null,
  events text[] not null,
  created_by_key uuid references public.api_keys (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists webhooks_account_idx on public.webhooks (account_id) where active;
alter table public.webhooks enable row level security; -- server only (managed through the API)

create table if not exists public.webhook_events (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  event text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.webhook_events enable row level security;

create table if not exists public.webhook_deliveries (
  id bigint generated always as identity primary key,
  webhook_id uuid not null references public.webhooks (id) on delete cascade,
  event_id bigint not null references public.webhook_events (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists webhook_deliveries_due_idx on public.webhook_deliveries (next_attempt_at) where status = 'pending';
alter table public.webhook_deliveries enable row level security;

-- an event for an account: stored once, one delivery per subscribed webhook (nothing at all when it has none)
create or replace function public.emit_webhook(p_account uuid, p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev bigint;
begin
  if p_account is null or not exists (select 1 from public.webhooks w where w.account_id = p_account and w.active and p_event = any (w.events)) then
    return;
  end if;
  insert into public.webhook_events (account_id, event, payload) values (p_account, p_event, p_payload) returning id into ev;
  insert into public.webhook_deliveries (webhook_id, event_id)
    select w.id, ev from public.webhooks w where w.account_id = p_account and w.active and p_event = any (w.events);
end;
$$;
revoke all on function public.emit_webhook(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.webhook_task_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acc uuid;
  body jsonb;
begin
  select account_id into acc from public.profiles where id = coalesce(new.assigner_id, new.owner_id);
  body := jsonb_build_object('task', jsonb_build_object(
    'id', new.id, 'title', new.title, 'status', new.status, 'priority', new.priority, 'due_at', new.due_at,
    'owner_id', new.owner_id, 'assigner_id', new.assigner_id, 'progress', new.progress, 'source', new.source,
    'updated_at', new.updated_at));
  if tg_op = 'INSERT' then
    perform public.emit_webhook(acc, 'task.created', body);
  elsif new.status is distinct from old.status and new.status = 'done' then
    perform public.emit_webhook(acc, 'task.done', body);
  elsif (new.status, new.due_at, new.owner_id, new.priority, new.title) is distinct from (old.status, old.due_at, old.owner_id, old.priority, old.title) then
    perform public.emit_webhook(acc, 'task.updated', body);
  end if;
  return new;
end;
$$;
drop trigger if exists webhook_task_events on public.tasks;
create trigger webhook_task_events after insert or update on public.tasks for each row execute function public.webhook_task_events();

create or replace function public.webhook_decision_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acc uuid;
  body jsonb;
begin
  select account_id into acc from public.profiles where id = new.manager_id;
  body := jsonb_build_object('decision', jsonb_build_object(
    'id', new.id, 'type', new.type, 'status', new.status, 'title', new.title, 'title_ar', new.title_ar,
    'task_id', new.task_id, 'requested_by', new.requested_by, 'manager_id', new.manager_id,
    'recommendation', new.recommendation, 'resolved_at', new.resolved_at));
  if tg_op = 'INSERT' then
    perform public.emit_webhook(acc, 'decision.created', body);
  elsif old.status = 'pending' and new.status <> 'pending' then
    perform public.emit_webhook(acc, 'decision.resolved', body);
  end if;
  return new;
end;
$$;
drop trigger if exists webhook_decision_events on public.decisions;
create trigger webhook_decision_events after insert or update of status on public.decisions for each row execute function public.webhook_decision_events();

-- ─── every minute: send what's due (webhook-dispatch), and tidy old rows daily ─
select cron.unschedule('webhook-dispatch') where exists (select 1 from cron.job where jobname = 'webhook-dispatch');
select cron.schedule(
  'webhook-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://katwiedukkvssuxbjbqf.supabase.co/functions/v1/webhook-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from public.webhook_deliveries where status = 'pending' and next_attempt_at <= now());
  $$
);
select cron.unschedule('api-tidy') where exists (select 1 from cron.job where jobname = 'api-tidy');
select cron.schedule('api-tidy', '23 3 * * *', $$
  delete from public.api_idempotency where created_at < now() - interval '1 day';
  delete from public.api_rate where window_start < now() - interval '1 day';
  delete from public.webhook_events where created_at < now() - interval '30 days';
$$);
