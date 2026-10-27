-- Google Play review company (owner, 27 Oct: "set up the review login in a separate demo company"). Store reviewers
-- sign in as its manager with play-review@muntej.app + the fixed code in the REVIEW_LOGIN_CODE secret
-- (supabase/functions/quick-login). Nobody here is a real person: no phones, every notification channel off, emails on
-- the unroutable demo.muntej.test domain. Re-running resets this company only (fresh due dates), never another one.
-- Run: scripts\db-apply.ps1 -Sql (Get-Content scripts\store\review-seed.sql -Raw -Encoding UTF8)

do $$
declare
  demo constant uuid := 'c0000000-0000-4000-b000-000000000001';
  boss constant uuid := 'c0000000-0000-4000-b000-000000000010';
  faisal constant uuid := 'c0000000-0000-4000-b000-000000000011';
  abdullah constant uuid := 'c0000000-0000-4000-b000-000000000012';
  noura constant uuid := 'c0000000-0000-4000-b000-000000000013';
  khalid constant uuid := 'c0000000-0000-4000-b000-000000000014';
  saad constant uuid := 'c0000000-0000-4000-b000-000000000015';
  maha constant uuid := 'c0000000-0000-4000-b000-000000000016';
  late_task uuid;
  sent uuid;
begin
  insert into public.accounts (id, name, name_ar) values (demo, 'Horizon Trading (demo)', 'شركة الأفق (تجريبية)')
  on conflict (id) do update set name = excluded.name, name_ar = excluded.name_ar;

  -- what the reviewers did last time, in this company only
  delete from public.ideas where account_id = demo;
  delete from public.team_drafts where account_id = demo;
  delete from public.invites where account_id = demo;
  delete from public.tasks where assigner_id in (select id from public.profiles where account_id = demo)
                              or owner_id in (select id from public.profiles where account_id = demo);
  delete from public.profiles where account_id = demo and id not in (boss, faisal, abdullah, noura, khalid, saad, maha);

  insert into public.profiles (id, account_id, full_name, full_name_ar, title, email, role, manager_id, status, locale)
  values
    (boss, demo, 'Ahmed (reviewer)', 'أحمد', 'General Manager', 'play-review@muntej.app', 'admin', null, 'active', 'en'),
    (faisal, demo, 'Faisal', 'فيصل', 'Sales Manager', 'faisal@demo.muntej.test', 'manager', boss, 'active', 'ar'),
    (abdullah, demo, 'Abdullah', 'عبدالله', 'Sales Representative', 'abdullah@demo.muntej.test', 'employee', faisal, 'active', 'ar'),
    (noura, demo, 'Noura', 'نورة', 'Operations Manager', 'noura@demo.muntej.test', 'manager', boss, 'active', 'ar'),
    (khalid, demo, 'Khalid', 'خالد', 'Logistics Coordinator', 'khalid@demo.muntej.test', 'employee', noura, 'active', 'ar'),
    (saad, demo, 'Saad', 'سعد', 'Designer', 'saad@demo.muntej.test', 'employee', boss, 'active', 'ar'),
    (maha, demo, 'Maha', 'مها', 'Accountant', 'maha@demo.muntej.test', 'employee', noura, 'pending', 'ar')
  on conflict (id) do update set
    full_name = excluded.full_name, full_name_ar = excluded.full_name_ar, title = excluded.title, role = excluded.role,
    manager_id = excluded.manager_id, status = excluded.status, deleted_batch = null, phone = null, email = excluded.email;

  -- nothing goes out from the demo company
  insert into public.notification_prefs (profile_id, channels)
  select id, '{"push": false, "email": false, "whatsapp": false, "teams": false}'::jsonb
    from public.profiles where account_id = demo and id <> boss
  on conflict (profile_id) do update set channels = excluded.channels;
  delete from public.push_tokens where profile_id in (select id from public.profiles where account_id = demo and id <> boss);

  insert into public.tasks (title, owner_id, assigner_id, due_at, priority, status, progress)
  values ('Send the Q4 sales forecast', faisal, boss, now() - interval '1 day', 'high', 'in_progress', 60)
  returning id into late_task;
  insert into public.tasks (title, owner_id, assigner_id, due_at, priority, status, closed_at, progress) values
    ('Review the supplier contract', noura, boss, now() + interval '4 hours', 'high', 'assigned', null, 0),
    ('Prepare the client demo for Al Noor', abdullah, faisal, now() + interval '1 day', 'medium', 'in_progress', null, 40),
    ('Book the warehouse inspection', khalid, noura, now() - interval '3 hours', 'medium', 'done', now() - interval '1 hour', 100),
    ('Design the new product brochure', saad, boss, now() + interval '3 days', 'low', 'blocked', null, 30),
    ('Close the September accounts', maha, noura, now() + interval '2 days', 'medium', 'assigned', null, 0),
    ('Update the price list', faisal, boss, now() + interval '5 days', 'medium', 'assigned', null, 0),
    ('Renew the trade license', boss, boss, now() + interval '6 days', 'urgent', 'assigned', null, 0);

  insert into public.tasks (title, owner_id, assigner_id, due_at, priority, status, progress)
  values ('Send the signed NDA', saad, boss, now() + interval '1 day', 'medium', 'submitted', 100)
  returning id into sent;
  insert into public.reviews (task_id, round, submitted_by, reviewer_id) values (sent, 1, saad, boss);

  insert into public.decisions (task_id, manager_id, requested_by, type, title, title_ar, details, recommendation, recommendation_ar)
  values (late_task, boss, faisal, 'extension_request', 'Faisal asks for more time on "Send the Q4 sales forecast"',
          'فيصل يطلب وقت زيادة في «Send the Q4 sales forecast»', jsonb_build_object('new_due_at', now() + interval '1 day'),
          'Give one more working day', 'عطه يوم عمل زيادة');
end $$;
