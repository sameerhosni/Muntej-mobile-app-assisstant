-- Proof optional by default (owner, 27 Oct: "I don't need evidence mandatory"; and after adding it the verdict stayed
-- "missing"):
--   1. set_proof_required(task, kind): whoever gave the task (or an admin / a manager above the owner) asks for proof or
--      makes it optional again; Muntej no longer sets it on its own (chat + intake prompts changed with this).
--   2. adding or removing proof while the work waits for review re-runs Muntej's check (verify-proof, recheck), so the
--      verdict follows what's actually attached.
--   3. open tasks Muntej had marked "needs proof" become optional (logged per task, with the old rule to undo).

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
  select * into t from public.tasks where id = task and account_id = public.current_account_id();
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

grant execute on function public.set_proof_required(uuid, text) to authenticated;
revoke execute on function public.set_proof_required(uuid, text) from anon, public;

-- proof added or removed while the work waits for review: check it again
create or replace function public.recheck_proof_on_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tid uuid := coalesce(new.task_id, old.task_id);
  rid uuid;
begin
  select r.id into rid
    from public.reviews r join public.tasks t on t.id = r.task_id
   where r.task_id = tid and r.decision is null and t.status = 'submitted'
   order by r.created_at desc
   limit 1;
  if rid is not null then
    perform net.http_post(
      url := 'https://katwiedukkvssuxbjbqf.supabase.co/functions/v1/verify-proof',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
      ),
      body := jsonb_build_object('review_id', rid, 'recheck', true)
    );
  end if;
  return coalesce(new, old);
exception when others then
  return coalesce(new, old); -- never block adding proof on the check
end;
$$;

drop trigger if exists recheck_proof_on_evidence on public.evidence;
create trigger recheck_proof_on_evidence after insert or delete on public.evidence
  for each row execute function public.recheck_proof_on_evidence();

-- open tasks Muntej marked "needs proof" become optional; each logged with the old rule so it can be undone
with changed as (
  update public.tasks t set proof_required = 'none'
    from (select id, proof_required as old_rule from public.tasks
           where status not in ('done', 'cancelled') and proof_required <> 'none') o
   where t.id = o.id
  returning t.id, t.title, t.owner_id, o.old_rule
)
insert into public.activity_log (actor_type, subject_id, task_id, action, summary, summary_ar, reason, undoable, undo_payload)
select 'muntej', owner_id, id, 'proof_rule_changed',
       format('Made proof optional on "%s"', title), format('خلّيت الإثبات اختياري في «%s»', title),
       'Proof is optional unless whoever gave the task asks for it', true, jsonb_build_object('proof_required', old_rule)
  from changed;
