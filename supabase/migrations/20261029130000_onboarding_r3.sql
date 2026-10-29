-- Chat onboarding release 3 (owner, 29 Oct): "Faisal joined" to whoever invited them, and gentle reminders.
--   member_joined   an invited person signed in for the first time (app, link or WhatsApp): whoever sent their
--                   invite (else their manager) hears it, with how many are in and who's still waiting. A win: it
--                   goes out right away on the channels they chose (alerts pipeline).
--   reminders       the onboarding-nudges function (daily) nudges a setup left halfway after 1 and 3 days, and resends
--                   an invite nobody opened after 1 and 3 days; these columns count them so it stops after two.

alter table public.onboarding add column if not exists nudges integer not null default 0;
alter table public.onboarding add column if not exists nudged_at timestamptz;

alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind in (
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
  'objective_achieved', 'objective_at_risk', 'objective_missed', 'changed_for_you',
  'task_assigned', 'new_submission', 'decision_waiting', 'no_reply', 'escalated', 'tool_sync', 'new_feature',
  'request_answered', 'ladder_nudge', 'support_reply', 'idea_update', 'member_joined'
));

create or replace function public.member_joined_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid;
  joined integer;
  total integer;
  waiting text;
  waiting_ar text;
  name_en text := split_part(new.full_name, ' ', 1);
  name_ar text := split_part(coalesce(nullif(new.full_name_ar, ''), new.full_name), ' ', 1);
begin
  if old.user_id is not null or new.user_id is null then
    return new;
  end if;
  -- whoever sent the latest invite, else their manager
  select i.invited_by into who from public.invites i where i.profile_id = new.id and i.invited_by is not null order by i.sent_at desc limit 1;
  who := coalesce(who, new.manager_id);
  if who is null or who = new.id then
    return new;
  end if;
  -- the people that person brought in (or manages): how many are in, who's still waiting
  select count(*) filter (where p.user_id is not null), count(*),
         string_agg(split_part(p.full_name, ' ', 1), ', ') filter (where p.user_id is null),
         string_agg(split_part(coalesce(nullif(p.full_name_ar, ''), p.full_name), ' ', 1), '، ') filter (where p.user_id is null)
    into joined, total, waiting, waiting_ar
    from public.profiles p
   where p.account_id = new.account_id and p.status <> 'deleted' and coalesce(p.hidden, false) = false and p.id <> who
     and (p.manager_id = who or exists (select 1 from public.invites i where i.profile_id = p.id and i.invited_by = who));
  insert into public.alerts (profile_id, kind, subject_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    who, 'member_joined', new.id,
    format('%s joined Muntej 🎉', name_en),
    case when waiting is null then format('Everyone is in (%s). Give them a first task!', total)
         else format('%s of %s are in. Still waiting: %s', joined, total, left(waiting, 120)) end,
    format('%s دخل منتج 🎉', name_ar),
    case when waiting_ar is null then format('كلهم دخلوا (%s). عطهم أول مهمة!', total)
         else format('صاروا %s من %s. باقي: %s', joined, total, left(waiting_ar, 120)) end,
    'joined:' || new.id
  )
  on conflict (dedupe_key) do nothing;
  insert into public.activity_log (actor_type, subject_id, action, summary, summary_ar, reason, undoable)
  values ('muntej', new.id, 'member_joined_notice', format('Told the inviter that %s joined', new.full_name),
          format('بلّغت اللي دعاه إن %s دخل', name_ar), 'first sign-in', false);
  return new;
end;
$$;
drop trigger if exists member_joined_notice on public.profiles;
create trigger member_joined_notice after update of user_id on public.profiles for each row execute function public.member_joined_notice();

-- the daily reminders (09:30 Riyadh)
select cron.unschedule('onboarding-nudges') where exists (select 1 from cron.job where jobname = 'onboarding-nudges');
select cron.schedule('onboarding-nudges', '30 6 * * *', $$
  select net.http_post(
    url := 'https://katwiedukkvssuxbjbqf.supabase.co/functions/v1/onboarding-nudges',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
$$);
