-- The task page's buttons (owner, 9 Nov, N2: "I need to be able to close the task or set it for review, ask for
-- deadline extension, or add a comment to the owner"). Two new actions, both in the person's own words:
--   add_task_comment  a comment on the task to the other side (doer ↔ giver): an alert to them, shown on the page
--   request_more_time the doer asks the giver for a new date: an extension_request decision (approve moves the date)

alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check check (kind in (
  'task_late', 'task_at_risk', 'overload', 'task_done_on_time', 'task_done_early', 'five_star',
  'objective_achieved', 'objective_at_risk', 'objective_missed', 'changed_for_you',
  'task_assigned', 'new_submission', 'decision_waiting', 'no_reply', 'escalated', 'tool_sync', 'new_feature',
  'request_answered', 'ladder_nudge', 'support_reply', 'idea_update', 'member_joined', 'added_to_company',
  'detail_asked', 'task_comment'
));

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task on public.task_comments (task_id, created_at);
alter table public.task_comments enable row level security;
drop policy if exists task_comments_select on public.task_comments;
create policy task_comments_select on public.task_comments for select to authenticated using (public.can_see_task(task_id));
-- written only through add_task_comment
revoke insert, update, delete on public.task_comments from authenticated;
grant select on public.task_comments to authenticated;

-- who the other side is: the doer's comment goes to whoever gave it (or the owner's manager for a task they gave
-- themselves); anyone else's goes to the owner
create or replace function public.task_other_side(t public.tasks, me uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when me in (coalesce(t.owner_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(t.helper_id, '00000000-0000-0000-0000-000000000000'::uuid))
      then coalesce(nullif(t.assigner_id, me), (select manager_id from public.profiles where id = t.owner_id))
    else t.owner_id
  end;
$$;
revoke all on function public.task_other_side(public.tasks, uuid) from public, anon;

create or replace function public.add_task_comment(p_task uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
  them uuid;
  who_en text;
  who_ar text;
  cid uuid;
  b text := btrim(coalesce(p_body, ''));
begin
  if me is null then raise exception 'Not signed in'; end if;
  if b = '' then raise exception 'Write something first'; end if;
  select * into t from public.tasks where id = p_task;
  if t.id is null or not public.can_see_task(p_task) then raise exception 'Task not found'; end if;
  them := public.task_other_side(t, me);

  insert into public.task_comments (task_id, author_id, body) values (p_task, me, left(b, 2000)) returning id into cid;

  select split_part(p.full_name, ' ', 1), split_part(coalesce(nullif(p.full_name_ar, ''), p.full_name), ' ', 1)
    into who_en, who_ar from public.profiles p where p.id = me;
  if them is not null and them <> me then
    insert into public.alerts (profile_id, kind, task_id, subject_id, title, body, title_ar, body_ar, dedupe_key)
    values (
      them, 'task_comment', t.id, me,
      left(format('💬 %s on "%s"', who_en, t.title), 200),
      left(b, 300),
      -- an Arabic word between the name and the title, so a Latin name can't swap sides
      left(format('💬 كتب %s في «%s»', who_ar, t.title), 200),
      left(b, 300),
      'comment:' || cid
    )
    on conflict (dedupe_key) do nothing;
  end if;
  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, reason, undoable)
  values ('user', me, coalesce(them, me), t.id, 'task_comment', 'Wrote a comment', 'كتب تعليق', left(b, 300), false);
  return cid;
end;
$$;
revoke all on function public.add_task_comment(uuid, text) from public, anon;
grant execute on function public.add_task_comment(uuid, text) to authenticated;

-- the doer asks for a new date, with their own reason. One open ask per task; true = sent, false = one is already open.
create or replace function public.request_more_time(p_task uuid, p_new_due timestamptz, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
  them uuid;
  who_en text;
  who_ar text;
  why text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into t from public.tasks where id = p_task;
  if t.id is null or me not in (coalesce(t.owner_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(t.helper_id, '00000000-0000-0000-0000-000000000000'::uuid)) then
    raise exception 'Only the person doing this task can ask for more time';
  end if;
  if p_new_due is null or p_new_due <= now() then raise exception 'Pick a later date'; end if;
  them := public.task_other_side(t, me);
  if them is null or them = me then raise exception 'Nobody to ask: change the date yourself'; end if;
  if exists (select 1 from public.decisions where task_id = p_task and type = 'extension_request' and status = 'pending') then
    return false;
  end if;
  select split_part(p.full_name, ' ', 1), split_part(coalesce(nullif(p.full_name_ar, ''), p.full_name), ' ', 1)
    into who_en, who_ar from public.profiles p where p.id = me;

  insert into public.decisions (task_id, manager_id, requested_by, type, title, title_ar, details,
                                recommendation, recommendation_ar, recommendation_reason)
  values (
    p_task, them, me, 'extension_request',
    left(format('%s asks for more time on "%s"', who_en, t.title), 200),
    left(format('%s يطلب وقت زيادة في «%s»', who_ar, t.title), 200),
    jsonb_build_object('new_due_at', p_new_due, 'old_due_at', t.due_at, 'reason', why, 'asked_from', 'task_page'),
    format('Move it to %s', to_char(p_new_due at time zone 'Asia/Riyadh', 'Dy DD Mon')),
    format('أجّلها لـ %s', to_char(p_new_due at time zone 'Asia/Riyadh', 'DD/MM')),
    coalesce(why, 'No reason given')
  );
  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, reason, undoable)
  values ('user', me, them, t.id, 'more_time_asked', 'Asked for more time', 'طلب وقت زيادة', why, false);
  return true;
end;
$$;
revoke all on function public.request_more_time(uuid, timestamptz, text) from public, anon;
grant execute on function public.request_more_time(uuid, timestamptz, text) to authenticated;
