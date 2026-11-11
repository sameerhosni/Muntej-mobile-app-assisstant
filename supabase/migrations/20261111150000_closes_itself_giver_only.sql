-- Nouran, 11 Nov: «لما تخلصها:» is now on the task page, the giver's switch. Consultant: the doer could flip it themself
-- (tasks_update lets the doer update the row) and skip the review. Only the giver side changes it: whoever gave it,
-- anyone above the owner, or an admin — and never while it waits for review or is closed. Each change is logged.
create or replace function public.closes_itself_giver_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
begin
  if new.closes_itself is not distinct from old.closes_itself then
    return new;
  end if;
  -- the server's own jobs (no signed-in seat) may set it
  if me is null then
    return new;
  end if;
  if old.status in ('submitted', 'done', 'cancelled') then
    raise exception 'It''s already sent or closed: nothing to change. خلاص انرسلت أو انقفلت.';
  end if;
  -- the giver side only: you gave it to someone else, you're above its owner, or an admin (never the doer)
  if not ((old.assigner_id = me and old.owner_id is distinct from me)
          or public.is_admin() or public.is_super_admin()
          or (old.owner_id is not null and old.owner_id <> me and public.is_below(old.owner_id, me))) then
    raise exception 'Only whoever gave the task can choose this. هذا القرار لللي عطى المهمة.';
  end if;
  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable, undo_payload)
  values ('user', me, coalesce(old.owner_id, me), old.id, 'closes_itself_changed',
          case when new.closes_itself then format('"%s" now closes by itself when done', old.title) else format('"%s" now comes to me to review', old.title) end,
          case when new.closes_itself then format('«%s» صارت تنقفل لحالها لما تخلص', old.title) else format('«%s» صارت تجيني أراجعها', old.title) end,
          true, jsonb_build_object('closes_itself', old.closes_itself));
  return new;
end;
$$;
drop trigger if exists closes_itself_giver_only on public.tasks;
create trigger closes_itself_giver_only before update of closes_itself on public.tasks
  for each row execute function public.closes_itself_giver_only();
