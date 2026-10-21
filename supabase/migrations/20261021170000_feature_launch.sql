-- Feature launches: every new feature is announced by Saree3 to the people it's for, and Muntej tracks whether each
-- person uses it — new → seen → tried → using it, or "later" (asked again in 3 days, at most twice) / "not for me"
-- (never again; the "target later" list). People who haven't even seen it get one push after 3 days and a line in
-- their daily summary. Admins see the funnel per feature and can re-announce it to anyone.

create table if not exists public.features (
  key text primary key,
  audience text not null default 'all' check (audience in ('all', 'manager', 'employee', 'admin')),
  released_at timestamptz not null default now(),
  title text not null,
  title_ar text not null,
  benefit text not null, -- one line, what it does for you
  benefit_ar text not null,
  sort smallint not null default 0
);
alter table public.features enable row level security;
drop policy if exists features_read on public.features;
create policy features_read on public.features for select to authenticated using (true);
revoke insert, update, delete on public.features from authenticated, anon;
grant select on public.features to authenticated;

create table if not exists public.feature_events (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  feature_key text not null references public.features (key) on delete cascade,
  state text not null check (state in ('seen', 'tried', 'adopted', 'later', 'not_interested')),
  later_count smallint not null default 0,
  seen_at timestamptz,
  tried_at timestamptz,
  adopted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (profile_id, feature_key)
);
alter table public.feature_events enable row level security;
drop policy if exists feature_events_own on public.feature_events;
create policy feature_events_own on public.feature_events for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());
-- writes only through mark_feature (keeps the order of states)
revoke insert, update, delete on public.feature_events from authenticated, anon;
grant select on public.feature_events to authenticated;

-- move my state for a feature forward: seen < tried < adopted; later / not_interested are choices.
-- Using a feature (adopted) always wins, even after "not for me".
create or replace function public.mark_feature(p_key text, p_state text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  cur public.feature_events;
  rank_new int := case p_state when 'seen' then 1 when 'tried' then 2 when 'adopted' then 3 else 0 end;
  rank_cur int;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_state not in ('seen', 'tried', 'adopted', 'later', 'not_interested') then raise exception 'Unknown state'; end if;
  if not exists (select 1 from public.features where key = p_key) then return null; end if;
  select * into cur from public.feature_events where profile_id = me and feature_key = p_key;
  if not found then
    insert into public.feature_events (profile_id, feature_key, state, seen_at, tried_at, adopted_at, later_count)
    values (me, p_key, p_state, now(),
            case when p_state in ('tried', 'adopted') then now() end,
            case when p_state = 'adopted' then now() end,
            case when p_state = 'later' then 1 else 0 end);
    return p_state;
  end if;
  rank_cur := case cur.state when 'seen' then 1 when 'tried' then 2 when 'adopted' then 3 else 0 end;
  if cur.state = 'adopted' then return 'adopted'; end if; -- already using it
  if p_state = 'adopted' or (rank_new > 0 and rank_new > rank_cur and cur.state not in ('not_interested')) or p_state in ('later', 'not_interested') then
    update public.feature_events set
      state = p_state,
      later_count = later_count + case when p_state = 'later' then 1 else 0 end,
      tried_at = coalesce(tried_at, case when p_state in ('tried', 'adopted') then now() end),
      adopted_at = coalesce(adopted_at, case when p_state = 'adopted' then now() end),
      updated_at = now()
    where profile_id = me and feature_key = p_key;
    return p_state;
  end if;
  return cur.state;
end;
$$;
revoke all on function public.mark_feature(text, text) from public, anon;
grant execute on function public.mark_feature(text, text) to authenticated;

-- admins: announce a feature again to these people (everyone not already using it starts from "new")
create or replace function public.reannounce_feature(p_key text, p_profiles uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  delete from public.feature_events where feature_key = p_key and profile_id = any (p_profiles) and state <> 'adopted';
  get diagnostics n = row_count;
  delete from public.autopilot_marks where key like 'launch_push:' || p_key || ':%' and profile_id = any (p_profiles);
  return n;
end;
$$;
revoke all on function public.reannounce_feature(text, uuid[]) from public, anon;
grant execute on function public.reannounce_feature(text, uuid[]) to authenticated;

-- live: the adoption view updates as people try things
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'feature_events') then
    alter publication supabase_realtime add table public.feature_events;
  end if;
end $$;

-- a push for features someone hasn't even seen after 3 days
alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind in (
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
  'objective_achieved', 'objective_at_risk', 'objective_missed', 'changed_for_you',
  'task_assigned', 'new_submission', 'decision_waiting', 'no_reply', 'escalated', 'tool_sync', 'new_feature'
));

-- today's launches
insert into public.features (key, audience, title, title_ar, benefit, benefit_ar, sort) values
  ('today_home', 'manager', 'Your team''s day at a glance', 'يوم فريقك بنظرة',
   'Home shows what your team is working on, what''s late, and only what needs you. Approve finished work in one tap.',
   'الرئيسية تعرض وش يشتغل عليه فريقك، وش المتأخر، وبس اللي يحتاجك. واعتمد الشغل الخالص بضغطة.', 1),
  ('autopilot', 'manager', 'Muntej chases for you', 'منتج يلاحق عنك',
   'Late work, blocked tasks, overloaded people: Muntej follows up by itself and only brings you decisions.',
   'الشغل المتأخر والواقف والضغط الزايد: منتج يتابعها بنفسه ويجيبك بس بالقرارات.', 2),
  ('incoming', 'all', 'Paste or share any message', 'الصق أو شارك أي رسالة',
   'An email, a WhatsApp chat, meeting notes: Muntej pulls the tasks out for you.',
   'إيميل، محادثة واتساب، ملاحظات اجتماع: منتج يطلّع منها المهام عنك.', 3),
  ('tools', 'all', 'ClickUp, Jira and Trello, both ways', 'كليك أب وجيرا وتريلو بالاتجاهين',
   'Connect your tool once: tasks come in by themselves, yours go out, and done on one side closes the other.',
   'اربط أداتك مرة وحدة: المهام توصل لحالها، ومهامك تروح لها، واللي يخلص بطرف ينقفل بالثاني.', 4),
  ('saree3', 'all', 'Saree3 is closer than ever', 'سريع صار أقرب لك',
   'Drag me anywhere, hold me to talk, and I grow when something needs you.',
   'اسحبني لأي مكان، اضغط علي مطوّل وتكلّم، وأكبر لما شي يحتاجك.', 5),
  ('daily_summary', 'all', 'Your morning in one message', 'صباحك برسالة وحدة',
   'Every working morning at 8: what''s due, what''s late and what needs you, by push and email.',
   'كل صباح عمل الساعة ٨: وش المطلوب، وش المتأخر، ووش يحتاجك، بالإشعار والإيميل.', 6),
  ('view_as', 'admin', 'See it as a manager or an employee', 'شوفه كمدير أو كموظف',
   'Switch views from Settings to see exactly what your team sees.',
   'بدّل العرض من الإعدادات وشوف بالضبط وش يشوف فريقك.', 7)
on conflict (key) do nothing;
