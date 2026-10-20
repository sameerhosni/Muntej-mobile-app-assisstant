-- One notification pipeline: everything worth telling someone becomes a row in `alerts` (written by the server
-- or by the triggers below). The every-minute job (send-followups → _shared/notify.ts deliverPending) pushes each
-- new row once, respecting the person's Alerts settings (rule on/off, push channel, quiet hours: after-hours,
-- Friday, prayer times). Rows held for quiet hours get deliver_after and go out when it ends.
--   new kinds: task_assigned (someone gave you a task), new_submission (a task waits for your review),
--   decision_waiting (a decision waits for you), objective_at_risk / objective_missed (team-alerts),
--   no_reply (a follow-up got no answer) and escalated (your report didn't answer → manager is told).

alter table public.alerts add column if not exists delivered_at timestamptz;
alter table public.alerts add column if not exists deliver_after timestamptz;
-- everything already in the table counts as delivered (never re-send old alerts)
update public.alerts set delivered_at = coalesce(delivered_at, created_at);
create index if not exists alerts_pending_idx on public.alerts (created_at) where delivered_at is null;

alter table public.alerts drop constraint alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind in (
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
  'objective_achieved', 'objective_at_risk', 'objective_missed', 'changed_for_you',
  'task_assigned', 'new_submission', 'decision_waiting', 'no_reply', 'escalated'
));

-- ─── activity_log → alert for the person it concerns (assignments get their own wording) ─────────────────
create or replace function public.notify_subject_of_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text;
  who_ar text;
  task_title text;
begin
  if new.actor_type <> 'user' or new.actor_id is null or new.subject_id is null or new.subject_id = new.actor_id then
    return new;
  end if;
  select split_part(full_name, ' ', 1), split_part(coalesce(full_name_ar, full_name), ' ', 1)
    into who, who_ar from public.profiles where id = new.actor_id;

  if new.action = 'task_created' and new.task_id is not null then
    select title into task_title from public.tasks where id = new.task_id;
    insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
    values (
      new.subject_id, 'task_assigned', new.actor_id, new.task_id,
      left(format('%s assigned you: %s', coalesce(who, 'Someone'), coalesce(task_title, '')), 200),
      'Open it to see what is needed and when.',
      left(format('%s سند لك: %s', coalesce(who_ar, who, 'أحد'), coalesce(task_title, '')), 200),
      'افتحها تشوف المطلوب ومتى.',
      'change:' || new.id
    )
    on conflict (dedupe_key) do nothing;
    return new;
  end if;

  insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    new.subject_id, 'changed_for_you', new.actor_id, new.task_id,
    left(format('%s: %s', coalesce(who, 'Someone'), new.summary), 200),
    coalesce(new.reason, ''),
    left(format('%s: %s', coalesce(who_ar, who, 'أحد'), coalesce(new.summary_ar, new.summary)), 200),
    coalesce(new.reason, ''),
    'change:' || new.id
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

-- ─── a task waits for your review ─────────────────────────────────────────────
create or replace function public.notify_new_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  who text;
  who_ar text;
  reviewer uuid;
begin
  if new.decision is not null then
    return new;
  end if;
  select * into t from public.tasks where id = new.task_id;
  reviewer := coalesce(new.reviewer_id, nullif(t.assigner_id, new.submitted_by),
                       (select manager_id from public.profiles where id = new.submitted_by));
  if reviewer is null or reviewer = new.submitted_by then
    return new;
  end if;
  select split_part(full_name, ' ', 1), split_part(coalesce(full_name_ar, full_name), ' ', 1)
    into who, who_ar from public.profiles where id = new.submitted_by;
  insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    reviewer, 'new_submission', new.submitted_by, new.task_id,
    left(format('%s finished: %s', coalesce(who, 'Someone'), t.title), 200),
    coalesce(nullif(new.submission_note, ''), 'It is waiting for your review.'),
    left(format('%s خلّص: %s', coalesce(who_ar, who, 'أحد'), t.title), 200),
    coalesce(nullif(new.submission_note, ''), 'تنتظر مراجعتك.'),
    'review:' || new.id
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists reviews_notify on public.reviews;
create trigger reviews_notify after insert on public.reviews for each row execute function public.notify_new_submission();

-- ─── a decision waits for you ─────────────────────────────────────────────────
create or replace function public.notify_decision_waiting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'pending' then
    return new;
  end if;
  insert into public.alerts (profile_id, kind, subject_id, task_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    new.manager_id, 'decision_waiting', new.requested_by, new.task_id,
    left(format('Decision needed: %s', new.title), 200),
    coalesce(new.recommendation, 'Open Decisions to answer it.'),
    left(format('قرار ينتظرك: %s', coalesce(new.title_ar, new.title)), 200),
    coalesce(new.recommendation_ar, new.recommendation, 'افتح القرارات وجاوب.'),
    'decision:' || new.id
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists decisions_notify on public.decisions;
create trigger decisions_notify after insert on public.decisions for each row execute function public.notify_decision_waiting();

revoke all on function public.notify_new_submission() from public, anon, authenticated;
revoke all on function public.notify_decision_waiting() from public, anon, authenticated;

-- ─── people may mark all their alerts read in one go ──────────────────────────
create or replace function public.mark_alerts_read()
returns integer
language sql
security invoker
set search_path = ''
as $$
  with u as (
    update public.alerts set read_at = now()
     where profile_id = public.current_profile_id() and read_at is null
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function public.mark_alerts_read() from public, anon;
grant execute on function public.mark_alerts_read() to authenticated;
