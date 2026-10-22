-- Proof (BRD v1.2 M6): "done" means proven.
--   tasks.proof_required  what the finished work must show: none · any · file · image · link (Muntej sets it when the
--                         task is created, from what "done" means; anyone can change it by saying so in the chat)
--   finishing gate        the OWNER can't send it for review / close it until that kind of proof is attached
--                         (a manager approving, or Muntej auto-approving, is never blocked)
--   reviews.ai_check      Muntej's check of the proof against the task, written by the verify-proof function the
--                         moment the work is sent in: { verdict: pass|missing|unclear, passed[], missing[], summary }
alter table public.tasks add column if not exists proof_required text not null default 'none'
  check (proof_required in ('none', 'any', 'file', 'image', 'link'));
alter table public.reviews add column if not exists ai_check jsonb;

create or replace function public.require_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('submitted', 'done') and old.status is distinct from new.status
     and new.proof_required <> 'none'
     and new.owner_id is not null and new.owner_id = public.current_profile_id()
     and not exists (
       select 1 from public.evidence e
        where e.task_id = new.id
          and (new.proof_required = 'any' or e.type::text = new.proof_required)
     ) then
    raise exception 'PROOF_NEEDED:%', new.proof_required using hint = 'Attach the proof first';
  end if;
  return new;
end;
$$;

drop trigger if exists require_proof on public.tasks;
create trigger require_proof before update of status on public.tasks for each row execute function public.require_proof();

-- the moment work is sent in, Muntej checks the proof (verify-proof, same secret as the scheduled jobs)
create or replace function public.check_proof_on_submit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://katwiedukkvssuxbjbqf.supabase.co/functions/v1/verify-proof',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := jsonb_build_object('review_id', new.id)
  );
  return new;
exception when others then
  return new; -- never block a submission on the check
end;
$$;

drop trigger if exists check_proof_on_submit on public.reviews;
create trigger check_proof_on_submit after insert on public.reviews for each row execute function public.check_proof_on_submit();
