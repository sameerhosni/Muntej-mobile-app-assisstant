-- Run Muntej from WhatsApp + three reports a day (owner, 26 Oct: "full management from WhatsApp like in the app, and a
-- report in the morning, during the day and at the end of the day with all risks, achievements and required actions").

-- WhatsApp only lets a business write freely within 24 h of the person's last message; after that it needs an approved
-- template. The last message each person sent to Muntej's number, to know which one to use.
alter table public.profiles add column if not exists wa_last_inbound_at timestamptz;

-- What a WhatsApp button does when tapped (Confirm on a proposal, a pick, "send it back" waiting for a note). Button ids
-- are short, so the action waits here under a short key. Server only (the whatsapp function, service role).
create table if not exists public.wa_pending (
  key text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  body jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists wa_pending_profile_idx on public.wa_pending (profile_id, created_at desc);
alter table public.wa_pending enable row level security;
revoke all on public.wa_pending from authenticated, anon;

-- the midday and end-of-day reports are remembered like the morning one (once per person per day)
alter table public.daily_summaries drop constraint if exists daily_summaries_kind_check;
alter table public.daily_summaries add constraint daily_summaries_kind_check
  check (kind in ('daily', 'weekly', 'midday', 'evening'));

-- people who connected WhatsApp get the morning report there too (only when they never changed that rule's channels)
update public.notification_prefs np
   set rules = jsonb_set(coalesce(np.rules, '{}'::jsonb), '{daily_summary,channels}',
                         coalesce(np.rules -> 'daily_summary' -> 'channels', '["push","email"]'::jsonb) || '["whatsapp"]'::jsonb)
  from public.profiles p
 where p.id = np.profile_id
   and p.whatsapp_connected
   and not coalesce(np.rules -> 'daily_summary' -> 'channels', '[]'::jsonb) ? 'whatsapp'
   and coalesce(np.rules -> 'daily_summary' -> 'channels', '["push","email"]'::jsonb) <@ '["push","email"]'::jsonb;

-- What's new
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('whatsapp_control', 'all', now(), 'Run Muntej from WhatsApp',
   'أدر منتج من الواتساب',
   'Ask me anything on WhatsApp (+966 11 520 9855) like you do in the app: what''s late, move a task, give it to someone, approve a decision or a review. Plus three short reports a day: morning, midday and end of day.',
   'كلّمني على الواتساب (+966 11 520 9855) مثل التطبيق بالضبط: وش المتأخر، أجّل مهمة، حوّلها لأحد، اعتمد قرار أو مراجعة. وثلاث تقارير قصيرة باليوم: الصبح، الظهر، وآخر الدوام.', -17)
on conflict (key) do nothing;
