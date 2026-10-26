-- Ideas, problems and likes from people using Muntej (owner, 26 Oct: "a way to let users suggest ideas for improvements,
-- a feedback mechanism and a wish list in super admin and PostHog"). People send them from Saree3's menu, More and
-- Settings and see their own with a status; the super admin sees everyone's (wish list), sets the status and replies.
-- When the status or the reply changes, the person hears it from Saree3 (alert idea_update).

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  kind text not null check (kind in ('idea', 'problem', 'like')),
  body text not null check (length(trim(body)) between 3 and 2000),
  -- the screen it was sent from (e.g. "task-detail")
  screen text,
  status text not null default 'new' check (status in ('new', 'planned', 'building', 'done', 'not_now')),
  reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ideas_profile_idx on public.ideas (profile_id, created_at desc);
create index if not exists ideas_status_idx on public.ideas (status, created_at desc);
alter table public.ideas enable row level security;

drop policy if exists ideas_read on public.ideas;
create policy ideas_read on public.ideas for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_super_admin());
drop policy if exists ideas_add on public.ideas;
create policy ideas_add on public.ideas for insert to authenticated
  with check (profile_id = public.current_profile_id() and status = 'new' and reply is null
              and account_id = (select account_id from public.profiles where id = public.current_profile_id()));
drop policy if exists ideas_manage on public.ideas;
create policy ideas_manage on public.ideas for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
grant select, insert, update on public.ideas to authenticated;

-- one more alert kind: news about your idea
alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind in (
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
  'objective_achieved', 'objective_at_risk', 'objective_missed', 'changed_for_you',
  'task_assigned', 'new_submission', 'decision_waiting', 'no_reply', 'escalated', 'tool_sync', 'new_feature',
  'request_answered', 'ladder_nudge', 'support_reply', 'idea_update'
));

-- the super admin changed the status or replied: Saree3 tells the person
create or replace function public.ideas_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  what text := left(regexp_replace(new.body, '\s+', ' ', 'g'), 60);
  t_en text;
  t_ar text;
begin
  new.updated_at := now();
  if new.status is not distinct from old.status and new.reply is not distinct from old.reply then
    return new;
  end if;
  t_en := case new.status
    when 'done' then 'Your idea is live 🎉'
    when 'building' then 'We''re building your idea 🛠️'
    when 'planned' then 'Your idea is in the plan 🗓️'
    when 'not_now' then 'About your idea'
    else 'The Muntej team answered you' end;
  t_ar := case new.status
    when 'done' then 'فكرتك صارت حقيقة 🎉'
    when 'building' then 'نشتغل على فكرتك الحين 🛠️'
    when 'planned' then 'فكرتك دخلت الخطة 🗓️'
    when 'not_now' then 'بخصوص فكرتك'
    else 'فريق منتج رد عليك' end;
  insert into public.alerts (profile_id, kind, subject_id, title, body, title_ar, body_ar, dedupe_key)
  values (
    new.profile_id, 'idea_update', new.profile_id, t_en,
    coalesce(nullif(new.reply, ''), format('"%s"', what)),
    t_ar,
    coalesce(nullif(new.reply, ''), format('«%s»', what)),
    'idea:' || new.id || ':' || new.status || ':' || md5(coalesce(new.reply, ''))
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
drop trigger if exists ideas_notify on public.ideas;
create trigger ideas_notify before update on public.ideas for each row execute function public.ideas_notify();

-- What's new: tell people they can send ideas
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('ideas', 'all', now(), 'Tell us your idea',
   'قل لنا فكرتك',
   'Got an idea, a problem or something you love? Send it from my menu, More or Settings. You''ll see what happens to it, and I''ll tell you when it''s live.',
   'عندك فكرة أو مشكلة أو شي عجبك؟ أرسلها من قائمتي أو المزيد أو الإعدادات. تشوف وش صار فيها، وأبلّغك أول ما تصير حقيقة.', -18)
on conflict (key) do nothing;
