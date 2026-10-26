-- Muntej QA: a separate test company for the automatic checks (scripts/qa/run.mjs). Re-running it resets the company to
-- a known state: the same 6 people, a fixed set of tasks (late, due today, waiting for review, done today, stuck),
-- one decision waiting. EVERY statement here is limited to the QA account id below: real companies are never touched.
-- The test people have no phones and every notification channel off, so nothing is sent anywhere.
-- Run: scripts\db-apply.ps1 -SqlFile scripts\qa\seed.sql   (run.mjs does it)

do $$
declare
  qa constant uuid := 'a0000000-0000-4000-b000-000000000001';
  boss constant uuid := 'a0000000-0000-4000-b000-000000000010';
  faisal constant uuid := 'a0000000-0000-4000-b000-000000000011';
  abdullah constant uuid := 'a0000000-0000-4000-b000-000000000012';
  noura constant uuid := 'a0000000-0000-4000-b000-000000000013';
  khalid constant uuid := 'a0000000-0000-4000-b000-000000000014';
  saad constant uuid := 'a0000000-0000-4000-b000-000000000015';
  late_task uuid;
begin
  insert into public.accounts (id, name, name_ar) values (qa, 'Muntej QA (test)', 'منتج للاختبار')
  on conflict (id) do nothing;

  -- what earlier test runs left in the QA company only
  delete from public.ideas where account_id = qa;
  delete from public.team_drafts where account_id = qa;
  delete from public.invites where account_id = qa;
  delete from public.tasks where assigner_id in (select id from public.profiles where account_id = qa)
                              or owner_id in (select id from public.profiles where account_id = qa);
  delete from public.profiles where account_id = qa and id not in (boss, faisal, abdullah, noura, khalid, saad);
  -- every run tests a FIRST sign-in (the case that was broken): the test people's sign-ins go, only the test domain
  update public.profiles set user_id = null where account_id = qa;
  delete from auth.users where email like '%@qa.muntej.test';

  -- the people (the manager signs in through a one-time test link made by run.mjs; nobody else ever signs in)
  insert into public.profiles (id, account_id, full_name, full_name_ar, title, email, role, manager_id, status, locale)
  values
    (boss, qa, 'Ahmed QA', 'أحمد (اختبار)', 'Operations Manager', 'qa-manager@qa.muntej.test', 'admin', null, 'active', 'ar'),
    (faisal, qa, 'Faisal QA', 'فيصل', 'Sales Lead', 'qa-faisal@qa.muntej.test', 'manager', boss, 'active', 'ar'),
    (abdullah, qa, 'Abdullah QA', 'عبدالله', 'Sales Rep', 'qa-abdullah@qa.muntej.test', 'employee', faisal, 'active', 'ar'),
    (noura, qa, 'Noura QA', 'نورة', 'QA Lead', 'qa-noura@qa.muntej.test', 'manager', boss, 'active', 'ar'),
    (khalid, qa, 'Khalid QA', 'خالد', 'Tester', 'qa-khalid@qa.muntej.test', 'employee', noura, 'active', 'ar'),
    (saad, qa, 'Saad QA', 'سعد', 'Designer', 'qa-saad@qa.muntej.test', 'employee', boss, 'active', 'ar')
  on conflict (id) do update set
    full_name = excluded.full_name, full_name_ar = excluded.full_name_ar, title = excluded.title, role = excluded.role,
    manager_id = excluded.manager_id, status = 'active', phone = null, locale = 'ar';

  -- nothing goes out from the test company
  insert into public.notification_prefs (profile_id, channels)
  select id, '{"push": false, "email": false, "whatsapp": false, "teams": false}'::jsonb
    from public.profiles where account_id = qa
  on conflict (profile_id) do update set channels = excluded.channels;
  delete from public.push_tokens where profile_id in (select id from public.profiles where account_id = qa);

  -- the tasks
  insert into public.tasks (title, owner_id, assigner_id, due_at, priority, status)
  values ('Send the Q4 sales forecast', faisal, boss, now() - interval '2 days', 'high', 'in_progress')
  returning id into late_task;
  insert into public.tasks (title, owner_id, assigner_id, due_at, priority, status, closed_at, progress) values
    ('مراجعة عقد العميل', noura, boss, now() + interval '3 hours', 'medium', 'assigned', null, 0),
    ('Prepare the client demo', abdullah, faisal, now() + interval '1 day', 'medium', 'submitted', null, 90),
    ('اختبار نظام الدفع', khalid, noura, now() - interval '1 hour', 'medium', 'done', now() - interval '30 minutes', 100),
    ('Design the new brochure', saad, boss, now() + interval '2 days', 'low', 'blocked', null, 30),
    ('حجز قاعة الاجتماعات', boss, boss, now() - interval '1 day', 'medium', 'assigned', null, 0),
    ('Update the price list', faisal, boss, null, 'medium', 'assigned', null, 0);

  insert into public.decisions (task_id, manager_id, requested_by, type, title, title_ar, details, recommendation, recommendation_ar)
  values (late_task, boss, faisal, 'extension_request', 'Faisal asks for more time on "Send the Q4 sales forecast"',
          'فيصل يطلب وقت زيادة في «Send the Q4 sales forecast»', jsonb_build_object('new_due_at', now() + interval '1 day'),
          'Give one more working day', 'عطه يوم عمل زيادة');
end $$;
