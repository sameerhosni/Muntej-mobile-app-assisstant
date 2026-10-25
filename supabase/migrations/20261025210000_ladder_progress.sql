-- Value ladder: each step says how far along it is (owner: "not marked finished even though I used it"), so a
-- step that isn't done shows why: tasks handed off, follow-ups Saree3 sent, tasks closed, brief days, teammates.
create or replace function public.ladder_progress()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.current_profile_id() as id)
  select jsonb_build_object(
    'M2', (select count(*) from public.tasks t, me where t.assigner_id = me.id and t.owner_id is not null and t.owner_id <> me.id),
    'M3', (select count(*) from public.followups f join public.tasks t on t.id = f.task_id, me
            where t.assigner_id = me.id and t.owner_id <> me.id and f.status in ('sent', 'replied')),
    'M4', (select count(*) from public.tasks t, me where t.assigner_id = me.id and t.owner_id <> me.id and t.status = 'done'),
    'M5', (select count(*) from public.brief_opens b, me where b.profile_id = me.id and b.day > (now() at time zone 'Asia/Riyadh')::date - 7),
    'M6', (select count(distinct t.owner_id) from public.tasks t, me
            where t.status = 'done' and t.closed_at > now() - interval '7 days' and t.owner_id <> me.id and public.is_below(t.owner_id, me.id))
  );
$$;
revoke all on function public.ladder_progress() from public, anon;
grant execute on function public.ladder_progress() to authenticated;
