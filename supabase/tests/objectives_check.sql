-- Objectives checks (rolled back): auto-achieve, reopen, distribute, re-time on date change, edit permissions.
-- Usage: .\scripts\db-apply.ps1 -SqlFile supabase\tests\objectives_check.sql
begin;
create temp table r (n serial, test text, result text);
grant all on r to authenticated;
grant usage, select on sequence r_n_seq to authenticated;
update public.profiles set user_id = '11111111-1111-4111-8111-000000000001' where email = 's.hosni+faisal@t2.sa';
create temp table ids as select
  (select user_id from public.profiles where email = 's.hosni@t2.sa') as ahmed_uid,
  (select id from public.profiles where email = 's.hosni+saad@t2.sa') as saad;
grant select on ids to authenticated;
create temp table v (k text primary key, id uuid);
grant all on v to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', (select ahmed_uid from ids)), true);

-- objective over the next 10 days with 3 tasks (one due far outside the window)
insert into v select 'o', public.upsert_objective(jsonb_build_object('title', 'Test objective', 'start_at', now(), 'due_at', now() + interval '10 days'));
insert into v select 't1', public.create_task_with_plan(jsonb_build_object('title', 'T1', 'owner_id', (select saad from ids), 'due_at', now() + interval '3 days'));
insert into v select 't2', public.create_task_with_plan(jsonb_build_object('title', 'T2', 'owner_id', (select saad from ids), 'due_at', now() + interval '6 days'));
insert into v select 't3', public.create_task_with_plan(jsonb_build_object('title', 'T3', 'owner_id', (select saad from ids), 'due_at', now() + interval '40 days'));
select public.link_task((select id from v where k = t), (select id from v where k = 'o')) from (values ('t1'), ('t2'), ('t3')) x(t);

insert into r (test, result) select 'tasks linked', count(*)::text from public.tasks where objective_id = (select id from v where k = 'o');
insert into r (test, result) select 'outside window before distribute',
  count(*)::text from public.tasks t join public.objectives o on o.id = t.objective_id where o.id = (select id from v where k = 'o') and t.due_at > o.due_at;
select public.distribute_tasks((select id from v where k = 'o'));
insert into r (test, result) select 'outside window after distribute (expect 0)',
  count(*)::text from public.tasks t join public.objectives o on o.id = t.objective_id where o.id = (select id from v where k = 'o') and t.due_at > o.due_at;

-- move the window 10 days later → tasks follow
insert into r (test, result) select 'T1 due before move', to_char((select due_at from public.tasks where id = (select id from v where k = 't1')), 'MM-DD HH24');
select public.upsert_objective(jsonb_build_object('id', (select id from v where k = 'o'), 'start_at', now() + interval '10 days', 'due_at', now() + interval '20 days'));
insert into r (test, result) select 'T1 due after move (later)', to_char((select due_at from public.tasks where id = (select id from v where k = 't1')), 'MM-DD HH24');

-- finish all tasks → achieved; reopen one → active
update public.tasks set status = 'done', closed_at = now() where objective_id = (select id from v where k = 'o');
insert into r (test, result) select 'status after all done (expect achieved)', status::text from public.objectives where id = (select id from v where k = 'o');
update public.tasks set status = 'in_progress', closed_at = null where id = (select id from v where k = 't2');
insert into r (test, result) select 'status after reopen (expect active)', status::text from public.objectives where id = (select id from v where k = 'o');

-- Faisal (employee, not owner/creator) cannot edit it
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-000000000001","role":"authenticated"}', true);
do $$ begin
  perform public.upsert_objective(jsonb_build_object('id', (select id from v where k = 'o'), 'title', 'hacked'));
  insert into r (test, result) values ('employee edits others objective (expect blocked)', 'allowed');
exception when others then
  insert into r (test, result) values ('employee edits others objective (expect blocked)', 'blocked: ' || sqlerrm);
end $$;
insert into r (test, result) select 'employee can see it (no task of his) (expect 0)', count(*)::text from public.objectives where id = (select id from v where k = 'o');

select test, result from r order by n;
rollback;
