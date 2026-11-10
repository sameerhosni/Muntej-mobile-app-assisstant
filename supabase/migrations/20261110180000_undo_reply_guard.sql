-- Reviewer, 10 Nov (3rd pass): a reply-close may be undone for 7 days, but never over someone else's decision since
-- (the manager approved or sent back the review, or the task moved on): then the undo says so instead.
do $do$
declare
  def text := pg_get_functiondef('public.undo_task_changes'::regproc);
  anchor text := $$  for item in select * from jsonb_array_elements(l.undo_payload -> 'tasks') loop$$;
  guard text := $$  -- a late undo of a reply-close never overrides what happened since (R108)
  if l.action = 'closed_by_reply' and (
       exists (select 1 from public.reviews r where r.task_id = l.task_id and r.decided_at > l.created_at)
       or (select tk.status from public.tasks tk where tk.id = l.task_id) not in ('done', 'submitted')) then
    raise exception 'It moved on since: someone already acted on it';
  end if;
$$;
begin
  if position('moved on since' in def) > 0 then return; end if;
  if position(anchor in def) = 0 then raise exception 'undo_task_changes changed shape: patch it by hand'; end if;
  execute replace(def, anchor, guard || anchor);
end;
$do$;
