-- Org permission checks: impersonates seed people inside a transaction that is rolled back.
-- Usage: .\scripts\db-apply.ps1 -SqlFile supabase\tests\org_check.sql
begin;
create temp table r (n serial, test text, expected text, result text);
grant all on r to authenticated;
grant usage, select on sequence r_n_seq to authenticated;

-- link test logins (rolled back)
update public.profiles set user_id = '11111111-1111-4111-8111-000000000001' where email = 's.hosni+faisal@t2.sa';
update public.profiles set user_id = '11111111-1111-4111-8111-000000000005' where email = 's.hosni+khalid@t2.sa';
create temp table ids as select
  (select id from public.profiles where email = 's.hosni@t2.sa') as ahmed,
  (select id from public.profiles where email = 's.hosni+faisal@t2.sa') as faisal,
  (select id from public.profiles where email = 's.hosni+khalid@t2.sa') as khalid,
  (select id from public.profiles where email = 's.hosni+saad@t2.sa') as saad,
  (select id from public.profiles where email = 's.hosni+maha@t2.sa') as maha;
grant select on ids to authenticated;
-- setup: Khalid manages Saad, Saad manages Maha (a 3-level branch)
update public.profiles set role = 'manager', manager_id = (select ahmed from ids) where id = (select khalid from ids);
update public.profiles set manager_id = (select khalid from ids) where id = (select saad from ids);
update public.profiles set manager_id = (select saad from ids) where id = (select maha from ids);

create or replace function pg_temp.try(test text, expected text, p jsonb) returns void language plpgsql as $$
begin
  perform public.upsert_person(p);
  insert into r (test, expected, result) values (test, expected, 'allowed');
exception when others then
  insert into r (test, expected, result) values (test, expected, 'blocked: ' || sqlerrm);
end $$;

set local role authenticated;

-- as Faisal (employee)
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-000000000001","role":"authenticated"}', true);
select pg_temp.try('employee edits own skills', 'allowed', jsonb_build_object('id', (select faisal from ids), 'skills_detail', '[{"name":"Sales","level":4}]'::jsonb, 'years_experience', 7));
select pg_temp.try('employee edits own title', 'blocked', jsonb_build_object('id', (select faisal from ids), 'title', 'CEO'));
select pg_temp.try('employee edits someone else', 'blocked', jsonb_build_object('id', (select saad from ids), 'title', 'x'));
select pg_temp.try('employee adds a person', 'blocked', jsonb_build_object('full_name', 'Test Person', 'manager_id', (select faisal from ids)));

-- as Khalid (manager of Saad → Maha)
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-000000000005","role":"authenticated"}', true);
select pg_temp.try('manager edits direct report', 'allowed', jsonb_build_object('id', (select saad from ids), 'title', 'Senior QA'));
select pg_temp.try('manager edits 2 levels down', 'allowed', jsonb_build_object('id', (select maha from ids), 'weekly_capacity_hours', 35));
select pg_temp.try('manager edits outside branch', 'blocked', jsonb_build_object('id', (select faisal from ids), 'title', 'x'));
select pg_temp.try('manager makes someone admin', 'blocked', jsonb_build_object('id', (select saad from ids), 'role', 'admin'));
select pg_temp.try('manager adds under himself', 'allowed', jsonb_build_object('full_name', 'Reem Test', 'title', 'QA Engineer', 'manager_id', (select khalid from ids)));
select pg_temp.try('manager moves report out of branch', 'blocked', jsonb_build_object('id', (select saad from ids), 'manager_id', (select ahmed from ids)));
select pg_temp.try('manager sees deep task count', 'n/a', '{}'::jsonb) where false;

-- as Ahmed (super admin)
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', (select user_id from public.profiles where email = 's.hosni@t2.sa')), true);
select pg_temp.try('cycle: Khalid under Maha', 'blocked', jsonb_build_object('id', (select khalid from ids), 'manager_id', (select maha from ids)));
select pg_temp.try('super admin makes an admin', 'allowed', jsonb_build_object('id', (select faisal from ids), 'role', 'admin'));
select pg_temp.try('mark someone deleted', 'allowed', jsonb_build_object('id', (select faisal from ids), 'status', 'deleted'));

select test, expected, result, (expected = split_part(result, ':', 1)) as pass from r order by n;
rollback;
