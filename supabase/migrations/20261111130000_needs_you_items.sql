-- Reviewer, 11 Nov (one «يحتاجك», pass 1, R138/R139): the app and WhatsApp built the list two ways and could disagree.
-- ONE list, read by both: what waits on this seat right now, one row per thing.
--   request   a pending decision you're the manager of (more time, busy, approval…)
--   cancel    a cancel request on an open task you gave (cancel_asked, unread)
--   review    finished work that's yours to approve: you gave it, or an open review round names you
--   question  a question about a task (detail_asked, unread), one per task
--   comment   a comment on an open task (task_comment, unread), one per task
-- Asks and comments count for 14 days, like the alerts they come from. Tasks found in your tools are not in it.

create or replace function public.needs_you_items(p_profile uuid)
returns table (kind text, task_id uuid, decision_id uuid, at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select 'request', d.task_id, d.id, d.created_at
    from public.decisions d
   where d.manager_id = p_profile and d.status = 'pending'
  union all
  select 'review', t.id, null::uuid, t.updated_at
    from public.tasks t
   where t.status = 'submitted' and t.owner_id is distinct from p_profile
     and (t.assigner_id = p_profile
          or exists (select 1 from public.reviews r where r.task_id = t.id and r.reviewer_id = p_profile and r.decision is null))
  union all
  select x.kind, x.task_id, null::uuid, x.at from (
    select distinct on (a.kind, a.task_id)
           case a.kind when 'cancel_asked' then 'cancel' when 'detail_asked' then 'question' else 'comment' end as kind,
           a.task_id, a.created_at as at
      from public.alerts a
      join public.tasks t on t.id = a.task_id
     where a.profile_id = p_profile and a.read_at is null
       and a.kind in ('cancel_asked', 'detail_asked', 'task_comment')
       and a.created_at > now() - interval '14 days'
       and t.status not in ('done', 'cancelled')
     order by a.kind, a.task_id, a.created_at desc
  ) x;
$$;
revoke all on function public.needs_you_items(uuid) from public, anon, authenticated;

-- the app's copy: the signed-in seat
create or replace function public.my_needs_you()
returns table (kind text, task_id uuid, decision_id uuid, at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.needs_you_items(public.current_profile_id());
$$;
revoke all on function public.my_needs_you() from public, anon;
grant execute on function public.my_needs_you() to authenticated;
