-- Value Ladder (docs: owner's spec "Muntej — Value Ladder"): the moments every user must reach to feel "create it and
-- forget it". Computed on the server from real data every 5 minutes, recorded once per person and rung, logged as the
-- analytics event (activity_log 'ladder_rung_reached'), celebrated once in the app, and one nudge per rung when stuck.
--   Manager  M1 first capture · M2 first hand-off (seen) · M3 first forget ⭐ · M4 closed loop · M5 brief habit ·
--            M6 team runs on it · M7 work comes to Muntej (M8 agents / M9 advocate: hidden until they ship)
--   Employee E1 clear ask (seen) · E2 easy update (one tap / reply) · E3 recognised (first done)

-- ── new signals ──
alter table public.tasks add column if not exists seen_at timestamptz;

/** the owner opened their task (task detail) or confirmed it: the first time only */
create or replace function public.mark_task_seen(p_task uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tasks set seen_at = now()
   where id = p_task and owner_id = public.current_profile_id() and seen_at is null;
$$;
revoke all on function public.mark_task_seen(uuid) from public, anon;
grant execute on function public.mark_task_seen(uuid) to authenticated;

create table if not exists public.brief_opens (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (profile_id, day)
);
alter table public.brief_opens enable row level security;
revoke all on public.brief_opens from anon, authenticated;

/** the person looked at their brief today (summaries, Your week, or Home opened from the morning push) */
create or replace function public.mark_brief_open()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.brief_opens (profile_id, day)
  select public.current_profile_id(), (now() at time zone 'Asia/Riyadh')::date
   where public.current_profile_id() is not null
  on conflict do nothing;
$$;
revoke all on function public.mark_brief_open() from public, anon;
grant execute on function public.mark_brief_open() to authenticated;

-- ── the ladder ──
create table if not exists public.value_ladder (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  rung_id text not null,
  reached_at timestamptz,
  celebrated_at timestamptz,
  nudged_at timestamptz,
  primary key (profile_id, rung_id)
);
alter table public.value_ladder enable row level security;
drop policy if exists value_ladder_own on public.value_ladder;
create policy value_ladder_own on public.value_ladder for select to authenticated using (profile_id = public.current_profile_id());
revoke insert, update, delete on public.value_ladder from anon, authenticated;
grant select on public.value_ladder to authenticated;

/** the app marks a reached rung as celebrated (toast / the M3 card shown once) */
create or replace function public.ladder_celebrated(p_rung text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.value_ladder set celebrated_at = now()
   where profile_id = public.current_profile_id() and rung_id = p_rung and reached_at is not null and celebrated_at is null;
$$;
revoke all on function public.ladder_celebrated(text) from public, anon;
grant execute on function public.ladder_celebrated(text) to authenticated;

-- nudges are alerts: one more kind
alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind in (
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
  'objective_achieved', 'objective_at_risk', 'objective_missed', 'changed_for_you',
  'task_assigned', 'new_submission', 'decision_waiting', 'no_reply', 'escalated', 'tool_sync', 'new_feature',
  'request_answered', 'ladder_nudge'
));

/** first time each rung was reached, for one person (null = not yet) */
create or replace function public.ladder_rungs(p uuid)
returns table (rung_id text, reached_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  -- M1 first capture: a task they made by voice or in the chat (capture and chat are the only creators)
  select 'M1', min(t.created_at) from public.tasks t where t.assigner_id = p and t.source in ('voice', 'text')
  union all
  -- M2 first hand-off: a task they gave someone else, and that person saw it
  select 'M2', min(t.seen_at) from public.tasks t where t.assigner_id = p and t.owner_id <> p and t.seen_at is not null
  union all
  -- M3 first forget: Saree3 followed up with the assignee by himself, the manager never stepped in
  select 'M3', min(f.sent_at)
    from public.followups f join public.tasks t on t.id = f.task_id
   where t.assigner_id = p and t.owner_id <> p and f.status in ('sent', 'replied') and f.sent_at is not null
     and coalesce(t.manager_touches, 0) = 0 and f.recipient_id = t.owner_id
  union all
  -- M4 closed loop: such a task is done (the manager hears it from Saree3)
  select 'M4', min(t.closed_at) from public.tasks t
   where t.assigner_id = p and t.owner_id <> p and t.status = 'done' and t.closed_at is not null
  union all
  -- M5 brief habit: the brief opened on 3 different days within 7 days
  select 'M5', min(b.day)::timestamptz from public.brief_opens b
   where b.profile_id = p
     and (select count(*) from public.brief_opens c where c.profile_id = p and c.day between b.day - 6 and b.day) >= 3
  union all
  -- M6 team runs on it: 3+ people under them closed a task in the last 7 days
  select 'M6', case when (
      select count(distinct t.owner_id) from public.tasks t
       where t.status = 'done' and t.closed_at > now() - interval '7 days' and t.owner_id <> p and public.is_below(t.owner_id, p)
    ) >= 3 then now() end
  union all
  -- M7 work comes to Muntej: a task added from a connected tool (not pasted)
  select 'M7', min(i.decided_at) from public.incoming_items i
   where i.owner_id = p and i.source not in ('paste', 'share')
     and exists (select 1 from jsonb_array_elements(i.suggestions) s where s->>'state' = 'accepted')
  union all
  -- E1 clear ask: opened their first task
  select 'E1', min(t.seen_at) from public.tasks t where t.owner_id = p and t.assigner_id is distinct from p
  union all
  -- E2 easy update: answered Saree3 with one tap / a reply
  select 'E2', min(a.created_at) from public.activity_log a where a.actor_id = p and a.action = 'update_received'
  union all
  -- E3 recognised: first task they finished
  select 'E3', min(t.closed_at) from public.tasks t where t.owner_id = p and t.status = 'done' and t.assigner_id is distinct from p;
$$;
revoke all on function public.ladder_rungs(uuid) from public, anon, authenticated;

/** every 5 minutes: record new rungs (once), log the event, and nudge whoever is stuck (once per rung) */
create or replace function public.compute_ladder()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr record;
  r record;
  n integer := 0;
  started timestamptz;
  is_mgr boolean;
  nxt text;
  wait interval;
  rung_names jsonb := '{
    "M1": ["First capture", "أول مهمة بصوتك"], "M2": ["First hand-off", "أول تسليم"],
    "M3": ["First forget", "أول مرة نسيتها"], "M4": ["First closed loop", "أول مهمة تقفل لحالها"],
    "M5": ["Daily brief habit", "عادة الملخص اليومي"], "M6": ["Team runs on it", "فريقك يشتغل عليه"],
    "M7": ["Work comes to Muntej", "الشغل يجي لمنتج"], "E1": ["Clear ask", "طلب واضح"],
    "E2": ["Easy update", "تحديث بضغطة"], "E3": ["Recognised", "شغلك ينشاف"]}';
begin
  for pr in
    select p.id, p.role, coalesce(o.started_at, p.created_at) as started
      from public.profiles p left join public.onboarding o on o.profile_id = p.id
     where p.status = 'active' and p.user_id is not null and coalesce(p.hidden, false) = false
  loop
    is_mgr := pr.role <> 'employee';
    for r in select * from public.ladder_rungs(pr.id) where reached_at is not null loop
      if (is_mgr and r.rung_id like 'M%') or (not is_mgr and r.rung_id like 'E%') then
        insert into public.value_ladder (profile_id, rung_id, reached_at)
        values (pr.id, r.rung_id, r.reached_at)
        on conflict (profile_id, rung_id) do update set reached_at = excluded.reached_at
          where public.value_ladder.reached_at is null;
        if found then
          n := n + 1;
          insert into public.activity_log (actor_type, subject_id, action, summary, summary_ar, reason, undoable)
          values ('muntej', pr.id, 'ladder_rung_reached',
                  format('Reached %s: %s', r.rung_id, rung_names->r.rung_id->>0),
                  format('وصل %s: %s', r.rung_id, rung_names->r.rung_id->>1),
                  r.rung_id, false);
        end if;
      end if;
    end loop;

    -- the next rung on their ladder, and how long to wait before one gentle nudge
    if is_mgr then
      select x.id, x.w into nxt, wait from (values ('M1', interval '10 minutes', 1), ('M2', interval '24 hours', 2),
                                                 ('M3', interval '48 hours', 3), ('M5', interval '5 days', 5)) as x(id, w, o)
       where not exists (select 1 from public.value_ladder v where v.profile_id = pr.id and v.rung_id = x.id and v.reached_at is not null)
         -- a later step already reached means they're past this one: no nudge
         and not exists (select 1 from public.value_ladder v where v.profile_id = pr.id and v.reached_at is not null
                           and v.rung_id in ('M2', 'M3', 'M4', 'M5', 'M6') and v.rung_id > x.id)
       order by x.o limit 1;
      if nxt is not null and now() - pr.started > wait
         and not exists (select 1 from public.value_ladder v where v.profile_id = pr.id and v.rung_id = nxt and v.nudged_at is not null) then
        insert into public.value_ladder (profile_id, rung_id, nudged_at) values (pr.id, nxt, now())
        on conflict (profile_id, rung_id) do update set nudged_at = now();
        insert into public.alerts (profile_id, kind, subject_id, title, body, title_ar, body_ar, dedupe_key)
        select pr.id, 'ladder_nudge', pr.id, m.t, m.b, m.ta, m.ba, 'ladder:' || pr.id || ':' || nxt
          from (values
            ('M1', 'Try your first task by voice', 'Just tap the mic and say it 🎤', 'جرّب أول مهمة بصوتك', 'بس اضغط المايك وقلها 🎤'),
            ('M2', 'Hand it to your team', 'Add a teammate and let Muntej deliver the task', 'سلّمها لفريقك', 'أضف واحد من فريقك وخلّ منتج يوصّل له المهمة'),
            ('M3', 'Give it a due date', 'Muntej will follow up for you', 'عطها موعد تسليم', 'ومنتج بيتابعها عنك'),
            ('M5', 'Your daily brief is ready', 'One minute to know where your team stands', 'ملخصك اليومي جاهز', 'دقيقة وتعرف وين وصل فريقك')
          ) as m(id, t, b, ta, ba)
         where m.id = nxt
        on conflict (dedupe_key) do nothing;
      end if;
    end if;
    nxt := null;
  end loop;
  return n;
end;
$$;
revoke all on function public.compute_ladder() from public, anon, authenticated;

select cron.unschedule('value-ladder') where exists (select 1 from cron.job where jobname = 'value-ladder');
select cron.schedule('value-ladder', '*/5 * * * *', $$ select public.compute_ladder() $$);

-- for the super admin: how fast people climb (starting targets: M1 < 3 min, M3 within 48 h ≥ 60%, M6 within 14 d ≥ 35%)
create or replace view public.ladder_metrics with (security_invoker = true) as
with mgr as (
  select p.id, coalesce(o.started_at, p.created_at) as started
    from public.profiles p left join public.onboarding o on o.profile_id = p.id
   where p.role <> 'employee' and p.status = 'active' and p.user_id is not null
), reached as (
  select m.id, m.started, v.rung_id, v.reached_at from mgr m join public.value_ladder v on v.profile_id = m.id where v.reached_at is not null
)
select
  (select count(*) from mgr) as managers,
  (select percentile_cont(0.5) within group (order by extract(epoch from reached_at - started) / 60) from reached where rung_id = 'M1') as median_min_to_m1,
  round(100.0 * (select count(*) from reached where rung_id = 'M3' and reached_at - started <= interval '48 hours') / nullif((select count(*) from mgr), 0), 1) as aha_rate_48h,
  round(100.0 * (select count(*) from reached where rung_id = 'M6' and reached_at - started <= interval '14 days') / nullif((select count(*) from mgr), 0), 1) as activation_14d,
  (select jsonb_object_agg(rung_id, c) from (select rung_id, count(*) c from reached group by rung_id) x) as reached_by_rung;
revoke all on public.ladder_metrics from anon;

-- before this, "seen" wasn't recorded: a task its owner answered, started, sent or finished was clearly seen
update public.tasks t set seen_at = coalesce(
    (select min(a.created_at) from public.activity_log a where a.task_id = t.id and a.actor_id = t.owner_id),
    t.closed_at, t.updated_at)
 where t.seen_at is null and t.owner_id is not null and t.status in ('in_progress', 'blocked', 'submitted', 'returned', 'done');

-- from now on: a task that moves on from "assigned" (Got it on the notification, started, sent, done) was seen
create or replace function public.task_seen_on_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.seen_at is null and new.status is distinct from old.status and new.status not in ('draft', 'assigned', 'cancelled') then
    new.seen_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists tasks_seen_on_move on public.tasks;
create trigger tasks_seen_on_move before update of status on public.tasks for each row execute function public.task_seen_on_move();

-- moments reached before the ladder existed (older than a day) aren't celebrated again
update public.value_ladder set celebrated_at = now() where reached_at < now() - interval '1 day' and celebrated_at is null;
