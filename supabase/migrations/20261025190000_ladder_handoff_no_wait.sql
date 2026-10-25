-- Value ladder (owner: "we shouldn't wait for any pending action in the steps, let's move forward"): the first
-- hand-off counts the moment you give a task to someone else, without waiting for them to open it.
create or replace function public.ladder_rungs(p uuid)
returns table (rung_id text, reached_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select 'M1', min(t.created_at) from public.tasks t where t.assigner_id = p and t.source in ('voice', 'text')
  union all
  -- M2 first hand-off: a task they gave someone else (no waiting for that person)
  select 'M2', min(t.created_at) from public.tasks t where t.assigner_id = p and t.owner_id is not null and t.owner_id <> p
  union all
  select 'M3', min(f.sent_at)
    from public.followups f join public.tasks t on t.id = f.task_id
   where t.assigner_id = p and t.owner_id <> p and f.status in ('sent', 'replied') and f.sent_at is not null
     and coalesce(t.manager_touches, 0) = 0 and f.recipient_id = t.owner_id
  union all
  select 'M4', min(t.closed_at) from public.tasks t
   where t.assigner_id = p and t.owner_id <> p and t.status = 'done' and t.closed_at is not null
  union all
  select 'M5', min(b.day)::timestamptz from public.brief_opens b
   where b.profile_id = p
     and (select count(*) from public.brief_opens c where c.profile_id = p and c.day between b.day - 6 and b.day) >= 3
  union all
  select 'M6', case when (
      select count(distinct t.owner_id) from public.tasks t
       where t.status = 'done' and t.closed_at > now() - interval '7 days' and t.owner_id <> p and public.is_below(t.owner_id, p)
    ) >= 3 then now() end
  union all
  select 'M7', min(i.decided_at) from public.incoming_items i
   where i.owner_id = p and i.source not in ('paste', 'share')
     and exists (select 1 from jsonb_array_elements(i.suggestions) s where s->>'state' = 'accepted')
  union all
  select 'E1', min(t.seen_at) from public.tasks t where t.owner_id = p and t.assigner_id is distinct from p
  union all
  select 'E2', min(a.created_at) from public.activity_log a where a.actor_id = p and a.action = 'update_received'
  union all
  select 'E3', min(t.closed_at) from public.tasks t where t.owner_id = p and t.status = 'done' and t.assigner_id is distinct from p;
$$;
revoke all on function public.ladder_rungs(uuid) from public, anon, authenticated;
