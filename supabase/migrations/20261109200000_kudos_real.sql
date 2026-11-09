-- N7 (owner, 9 Nov): "I sent a thank you for nouranemira, need to check if it reflected". The Thanks screen was a
-- demo: nothing was saved or sent. Now a thank-you is a row, the person thanked gets an alert (push), and the team
-- wall shows the company's real thanks.

alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind in (
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
  'objective_achieved', 'objective_at_risk', 'objective_missed', 'changed_for_you',
  'task_assigned', 'new_submission', 'decision_waiting', 'no_reply', 'escalated', 'tool_sync', 'new_feature',
  'request_answered', 'ladder_nudge', 'support_reply', 'idea_update', 'member_joined', 'added_to_company',
  'detail_asked', 'task_comment', 'kudos_received'
));

create table if not exists public.kudos (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  value text not null check (value in ('ownership', 'speed', 'quality', 'teamwork')),
  message text not null check (length(btrim(message)) between 1 and 1000),
  points integer not null default 0 check (points between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists kudos_account on public.kudos (account_id, created_at desc);
create index if not exists kudos_to on public.kudos (to_id, created_at desc);
alter table public.kudos enable row level security;
drop policy if exists kudos_select on public.kudos;
create policy kudos_select on public.kudos for select to authenticated using (account_id = public.current_account_id());
revoke insert, update, delete on public.kudos from authenticated;
grant select on public.kudos to authenticated;

create or replace function public.send_kudos(p_to uuid, p_value text, p_message text, p_points integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  acct uuid := public.current_account_id();
  kid uuid;
  who_en text;
  who_ar text;
  msg text := btrim(coalesce(p_message, ''));
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_to = me then raise exception 'Thank someone else'; end if;
  if not public.same_account(p_to) then raise exception 'That person isn''t in your company'; end if;
  if msg = '' then raise exception 'Write something first'; end if;

  insert into public.kudos (account_id, from_id, to_id, value, message, points)
  values (acct, me, p_to, p_value, left(msg, 1000), greatest(0, least(100, coalesce(p_points, 0))))
  returning id into kid;

  select split_part(p.full_name, ' ', 1), split_part(coalesce(nullif(p.full_name_ar, ''), p.full_name), ' ', 1)
    into who_en, who_ar from public.profiles p where p.id = me;
  insert into public.alerts (profile_id, kind, subject_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    p_to, 'kudos_received', me,
    left(format('👏 %s thanked you', who_en), 200),
    left(msg, 300),
    -- an Arabic word after the name, so a Latin name can't swap sides
    left(format('👏 %s شكرك', who_ar), 200),
    left(msg, 300),
    'kudos:' || kid
  )
  on conflict (dedupe_key) do nothing;
  insert into public.activity_log (actor_type, actor_id, subject_id, action, summary, summary_ar, reason, undoable)
  values ('user', me, p_to, 'kudos_sent', 'Sent a thank-you', 'أرسل شكر', left(msg, 300), false);
  return kid;
end;
$$;
revoke all on function public.send_kudos(uuid, text, text, integer) from public, anon;
grant execute on function public.send_kudos(uuid, text, text, integer) to authenticated;
