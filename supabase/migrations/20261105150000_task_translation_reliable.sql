-- Task translation lost work (QA, 5 Nov: a step stayed in English and an edit never got its new translation). Three causes:
--   * the database hung up on the translator after pg_net's default 5 seconds, and a translation takes longer,
--   * a request that came while another was translating was answered "busy" and forgotten,
--   * a call that never reached the translator (the DNS timeouts in net._http_response) was never tried again.
-- Now: a longer wait, a busy answer leaves a note for the translator at work, and a sweep every minute asks again for
-- recent tasks still missing something.

alter table public.task_translation_runs add column if not exists again boolean not null default false;

create or replace function public.request_task_translation(p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(array_length(public.task_translation_targets(p_task), 1), 0) = 0 then return; end if;
  perform net.http_post(
    url := 'https://katwiedukkvssuxbjbqf.supabase.co/functions/v1/translate-task',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := jsonb_build_object('task_id', p_task),
    timeout_milliseconds := 60000
  );
exception when others then
  raise warning 'task translation not requested: %', sqlerrm;
end;
$$;

-- yours to translate, or a note for whoever is translating that there's more
create or replace function public.claim_task_translation(p_task uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_translation_runs (task_id) values (p_task) on conflict (task_id) do nothing;
  if found then return true; end if;
  update public.task_translation_runs set claimed_at = now(), again = false
   where task_id = p_task and claimed_at < now() - interval '90 seconds';
  if found then return true; end if;
  update public.task_translation_runs set again = true where task_id = p_task;
  return false;
end;
$$;

-- true: someone asked while you were translating, look again. false: done, and the task is free.
create or replace function public.release_task_translation(p_task uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.task_translation_runs set again = false, claimed_at = now() where task_id = p_task and again;
  if found then return true; end if;
  delete from public.task_translation_runs where task_id = p_task;
  return false;
end;
$$;

create or replace function public.task_translation_missing(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.tasks t
      cross join lateral unnest(public.task_translation_targets(t.id)) as l(lang)
     where t.id = p_task
       and (
         t.translations -> l.lang ->> 'title' is null
         or (nullif(trim(t.description), '') is not null and t.translations -> l.lang ->> 'description' is null)
         or (nullif(trim(t.goal), '') is not null and t.translations -> l.lang ->> 'goal' is null)
         or (nullif(trim(t.definition_of_done), '') is not null and t.translations -> l.lang ->> 'definition_of_done' is null)
         or exists (
           select 1 from public.subtasks s
            where s.task_id = t.id and nullif(trim(s.title), '') is not null and t.translations -> l.lang -> 'steps' ->> s.id::text is null
         )
       )
  );
$$;

-- recent work only: this catches what got lost, it doesn't retry a broken translation forever
create or replace function public.sweep_task_translations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tid uuid;
  n integer := 0;
begin
  for tid in
    select t.id
      from public.tasks t
     where t.status not in ('done', 'cancelled')
       and (
         t.updated_at > now() - interval '15 minutes'
         or exists (select 1 from public.subtasks s where s.task_id = t.id and s.updated_at > now() - interval '15 minutes')
       )
       and public.task_translation_missing(t.id)
       -- not one being translated right now (a translator that crashed stops counting after 90 seconds)
       and not exists (select 1 from public.task_translation_runs r where r.task_id = t.id and r.claimed_at > now() - interval '90 seconds')
     limit 20
  loop
    perform public.request_task_translation(tid);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.claim_task_translation(uuid) from public, anon, authenticated;
revoke all on function public.release_task_translation(uuid) from public, anon, authenticated;
revoke all on function public.task_translation_missing(uuid) from public, anon, authenticated;
revoke all on function public.sweep_task_translations() from public, anon, authenticated;

select cron.schedule('translate-tasks-sweep', '* * * * *', $cron$select public.sweep_task_translations()$cron$);
