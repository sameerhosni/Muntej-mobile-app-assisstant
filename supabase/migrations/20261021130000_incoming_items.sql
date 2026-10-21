-- Incoming: messages from other tools (pasted text now; forwarded email and WhatsApp next) that Muntej reads and turns
-- into task suggestions. The person accepts, edits or ignores each one; nothing becomes a task without their OK.
-- Only the intake Edge Function (service role) writes rows; people read their own.
--
-- suggestions: [{ title, owner_id, due_at, priority, definition_of_done, estimate_hours, confidence, quote,
--                 duplicate_of: { id, title } | null, state: 'new' | 'accepted' | 'ignored', task_id }]

create table if not exists public.incoming_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade, -- who reviews it
  source text not null check (source in ('paste', 'share', 'email', 'whatsapp', 'teams', 'slack', 'jira')),
  external_id text not null, -- message id from the tool, or a hash of the text: the same message is never read twice
  sender text,
  subject text,
  body text not null,
  summary text, -- one line: what the message is about
  received_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'done', 'ignored', 'nothing')),
  suggestions jsonb not null default '[]',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (owner_id, source, external_id)
);
create index if not exists incoming_items_owner_status_idx on public.incoming_items (owner_id, status, received_at desc);

alter table public.incoming_items enable row level security;

drop policy if exists incoming_items_select_own on public.incoming_items;
create policy incoming_items_select_own on public.incoming_items for select to authenticated
  using (owner_id = public.current_profile_id());

revoke insert, update, delete on public.incoming_items from authenticated, anon;
grant select on public.incoming_items to authenticated;

-- live updates in the app
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'incoming_items') then
    alter publication supabase_realtime add table public.incoming_items;
  end if;
end $$;

-- PDPL: keep only what's needed — ignored / nothing-found items go after 90 days (accepted ones live on as tasks).
select cron.unschedule('incoming-retention') where exists (select 1 from cron.job where jobname = 'incoming-retention');
select cron.schedule(
  'incoming-retention',
  '30 2 * * *',
  $$ delete from public.incoming_items where status in ('ignored', 'nothing') and received_at < now() - interval '90 days' $$
);
