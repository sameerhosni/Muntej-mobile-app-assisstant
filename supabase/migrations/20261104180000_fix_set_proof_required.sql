-- "Request proof" failed for everyone (owner's screenshot, 4 Nov: column "account_id" does not exist): tasks have no
-- company of their own, they belong to the company of the people on them.
create or replace function public.set_proof_required(task uuid, kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_profile_id();
  t public.tasks;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if kind not in ('none', 'any', 'file', 'image', 'link') then
    raise exception 'Unknown proof kind';
  end if;
  select * into t from public.tasks x
   where x.id = task
     and exists (select 1 from public.profiles p where p.id in (x.owner_id, x.assigner_id) and p.account_id = public.current_account_id());
  if not found then
    raise exception 'Task not found';
  end if;
  if not (t.assigner_id = me or public.is_admin() or (t.owner_id is not null and public.is_below(t.owner_id, me))) then
    raise exception 'Only whoever gave the task can change what proof it needs';
  end if;
  if t.proof_required = kind then
    return;
  end if;
  update public.tasks set proof_required = kind where id = task;
  insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, undoable, undo_payload)
  values ('user', me, t.owner_id, task, 'proof_rule_changed',
          case when kind = 'none' then format('Made proof optional on "%s"', t.title) else format('Asked for proof on "%s"', t.title) end,
          case when kind = 'none' then format('خلّى الإثبات اختياري في «%s»', t.title) else format('طلب إثبات في «%s»', t.title) end,
          true, jsonb_build_object('proof_required', t.proof_required));
end;
$$;
