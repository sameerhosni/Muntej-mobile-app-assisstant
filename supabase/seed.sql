-- Muntej sample data: Ahmed (manager) + Faisal, Abdullah, Noura, Khalid, Saad, Maha.
-- Sign-in is by email OTP (emails set below). Dates are relative to now().
-- Runs once: if the sample people already exist the whole seed aborts (one transaction), nothing is duplicated.
--
-- Fixed ids:  profiles …-a000-0000000000NN   workspaces …-c000-…   tasks …-b000-…

do $$
begin
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-000000000001') then
    raise exception 'Seed already applied (Ahmed exists). Nothing changed.';
  end if;
end;
$$;

-- ─── People ───────────────────────────────────────────────────────────────────
insert into public.profiles (id, phone, full_name, full_name_ar, role, manager_id, title, title_ar, skills, avatar_color, weekly_capacity_hours) values
  ('00000000-0000-4000-a000-000000000001', '966500000001', 'Ahmed Al-Rashid',     'أحمد الراشد',     'manager',  null,                                   'Head of Business',        'رئيس قطاع الأعمال',     '{leadership,sales,strategy}', 'teal',   40),
  ('00000000-0000-4000-a000-000000000002', '966500000002', 'Faisal Shaheen',      'فيصل شاهين',      'employee', '00000000-0000-4000-a000-000000000001', 'Account Manager',         'مدير حسابات',           '{sales,presentations,clients}', 'teal',  40),
  ('00000000-0000-4000-a000-000000000003', '966500000003', 'Abdullah Al-Qahtani', 'عبدالله القحطاني', 'employee', '00000000-0000-4000-a000-000000000001', 'Financial Analyst',       'محلل مالي',             '{finance,excel,reporting}', 'blue',     40),
  ('00000000-0000-4000-a000-000000000004', '966500000004', 'Noura Al-Harbi',      'نورة الحربي',     'employee', '00000000-0000-4000-a000-000000000001', 'Marketing Lead',          'قائدة التسويق',         '{marketing,content,events}', 'purple',  40),
  ('00000000-0000-4000-a000-000000000005', '966500000005', 'Khalid Al-Otaibi',    'خالد العتيبي',    'employee', '00000000-0000-4000-a000-000000000001', 'Product Manager',         'مدير منتج',             '{product,research,roadmaps}', 'amber',  40),
  ('00000000-0000-4000-a000-000000000006', '966500000006', 'Saad Al-Dosari',      'سعد الدوسري',     'employee', '00000000-0000-4000-a000-000000000001', 'Software Engineer',       'مهندس برمجيات',         '{backend,mobile,integrations}', 'blue', 40),
  ('00000000-0000-4000-a000-000000000007', '966500000007', 'Maha Al-Zahrani',     'مها الزهراني',    'employee', '00000000-0000-4000-a000-000000000001', 'UX Designer',             'مصممة تجربة المستخدم',  '{design,ux,arabic-typography}', 'purple', 40)
on conflict (id) do nothing;

-- sign-in emails (email OTP); aliases all land in the same inbox
update public.profiles set email = v.email
  from (values
    ('966500000001', 's.hosni@t2.sa'),
    ('966500000002', 's.hosni+faisal@t2.sa'),
    ('966500000003', 's.hosni+abdullah@t2.sa'),
    ('966500000004', 's.hosni+noura@t2.sa'),
    ('966500000005', 's.hosni+khalid@t2.sa'),
    ('966500000006', 's.hosni+saad@t2.sa'),
    ('966500000007', 's.hosni+maha@t2.sa')
  ) as v(phone, email)
 where profiles.phone = v.phone;

-- ─── Workspaces ───────────────────────────────────────────────────────────────
insert into public.workspaces (id, name, name_ar, goal, color, owner_id) values
  ('00000000-0000-4000-c000-000000000001', 'Nizamy', 'نظامي', 'Ship Nizamy HR 2.4 with payroll and GOSI integration', '#5EB3E4', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-c000-000000000002', 'Wojood', 'وجود',  'Win SPL and two government accounts for Wojood this quarter', '#C79BF2', '00000000-0000-4000-a000-000000000001')
on conflict (id) do nothing;

insert into public.workspace_members (workspace_id, profile_id, role) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000005', 'Product'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000006', 'Engineering'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000007', 'Design'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000003', 'Finance'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000002', 'Accounts'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000004', 'Marketing'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000003', 'Finance')
on conflict do nothing;

-- ─── Tasks (22 active + 8 done) ───────────────────────────────────────────────
-- columns: id, title, workspace, owner, helper, start, due, expected_close, priority, status, progress, clarity, goal, dod, budget, estimate, source, source_ref, closed_at
insert into public.tasks (id, title, workspace_id, owner_id, assigner_id, helper_id, start_at, due_at, expected_close_at, priority, status, progress, clarity_score, goal, definition_of_done, budget, estimate_hours, source, source_ref, closed_at)
select v.id::uuid, v.title, v.ws::uuid, v.owner::uuid, '00000000-0000-4000-a000-000000000001', v.helper::uuid,
       now() + v.start_off::interval, now() + v.due_off::interval, now() + v.close_off::interval,
       v.priority::public.task_priority, v.status::public.task_status, v.progress, v.clarity,
       v.goal, v.dod, v.budget, v.est, v.source::public.task_source, v.source_ref,
       case when v.status = 'done' then now() + v.close_off::interval end
from (values
  ('00000000-0000-4000-b000-000000000001', 'Prepare SPL pitch deck',                    '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003', '-3 days',  '4 days',   '4 days',   'high',   'in_progress', 40,  75,  'SPL client',        'Deck v2 approved by Ahmed and sent to SPL', null,            22.0, 'meeting',  'Teams meeting · Jira SPL-142'),
  ('00000000-0000-4000-b000-000000000002', 'Q3 revenue numbers for the SPL deck',       '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000003', null,                                   '-2 days',  '2 days',   '2 days',   'high',   'in_progress', 70,  100, 'SPL client',        'Q3 sheet with revenue by segment, checked by finance', 'Internal',  6.0,  'voice',    null),
  ('00000000-0000-4000-b000-000000000003', 'Launch campaign plan for Wojood v2',        '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000004', null,                                   '-4 days',  '9 days',   '10 days',  'medium', 'in_progress', 35,  75,  'Wojood v2 launch',  'Channel plan, budget split and timeline approved', null,               16.0, 'text',     null),
  ('00000000-0000-4000-b000-000000000004', 'Social media calendar for November',        '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000007', '1 day',    '6 days',   '6 days',   'medium', 'assigned',    0,   100, 'Brand awareness',   '30 posts scheduled in Arabic and English', 'SAR 5,000',          8.0,  'whatsapp', 'WhatsApp'),
  ('00000000-0000-4000-b000-000000000005', 'Nizamy payroll module requirements',        '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000003', '-5 days',  '5 days',   '6 days',   'high',   'in_progress', 55,  100, 'Nizamy 2.4',        'PRD signed off by Ahmed and Saad', 'Internal',                    20.0, 'meeting',  'Teams meeting'),
  ('00000000-0000-4000-b000-000000000006', 'Fix login timeout bug on Nizamy mobile',    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000006', null,                                   '-1 day',   '1 day',    '1 day',    'urgent', 'in_progress', 80,  100, 'Nizamy 2.4',        'Fix released to TestFlight and Play internal track', 'Internal',  4.0,  'jira',     'Jira NZ-311'),
  ('00000000-0000-4000-b000-000000000007', 'Leave-request flow redesign',               '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000007', '00000000-0000-4000-a000-000000000005', '-2 days',  '7 days',   '7 days',   'medium', 'in_progress', 30,  75,  'Nizamy 2.4',        'Figma flow reviewed with 3 employees', null,                      14.0, 'voice',    null),
  ('00000000-0000-4000-b000-000000000008', 'GOSI integration API spec',                 '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000006', null,                                   '2 days',   '12 days',  '14 days',  'high',   'assigned',    10,  50,  'Nizamy 2.4',        null, null,                                                          24.0, 'text',     null),
  ('00000000-0000-4000-b000-000000000009', 'Customer feedback survey analysis',         '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000005', null,                                   '-6 days',  '3 days',   '0 days',   'medium', 'submitted',   100, 100, 'Nizamy 2.4',        'Top 10 insights with quotes, shared deck', 'Internal',            10.0, 'email',    'Email'),
  ('00000000-0000-4000-b000-000000000010', 'Vendor contract renewal',                   null,                                   '00000000-0000-4000-a000-000000000003', null,                                   '-8 days',  '-1 day',   '2 days',   'high',   'blocked',     50,  75,  'Cost control',      'Signed renewal with 8% discount', null,                           6.0,  'email',    'Email'),
  ('00000000-0000-4000-b000-000000000011', 'Ministry tender documents',                 '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000002', null,                                   '-2 days',  '10 days',  '13 days',  'urgent', 'in_progress', 20,  75,  'Government account', 'Complete tender pack submitted on Etimad', null,                 30.0, 'meeting',  'In-room meeting'),
  ('00000000-0000-4000-b000-000000000012', 'Onboarding guide for new hires',            null,                                   '00000000-0000-4000-a000-000000000007', null,                                   '3 days',   '14 days',  '14 days',  'low',    'assigned',    0,   75,  'Team growth',       'Bilingual PDF guide, 10 pages max', null,                         8.0,  'text',     null),
  ('00000000-0000-4000-b000-000000000013', 'Competitor pricing benchmark',              '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000003', '-5 days',  '2 days',   '3 days',   'medium', 'returned',    80,  100, 'SPL client',        'Table of 6 competitors with plan prices', 'Internal',             6.0,  'voice',    null),
  ('00000000-0000-4000-b000-000000000014', 'Wojood landing page copy (AR + EN)',        '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000007', '-1 day',   '4 days',   '4 days',   'medium', 'in_progress', 60,  100, 'Wojood v2 launch',  'Final copy in both languages, approved by Ahmed', 'Internal',     5.0,  'text',     null),
  ('00000000-0000-4000-b000-000000000015', 'Nizamy release 2.4 QA sign-off',            '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000006', null,                                   '-1 day',   '3 days',   '4 days',   'high',   'in_progress', 45,  100, 'Nizamy 2.4',        'All P1 test cases pass, sign-off doc shared', 'Internal',         12.0, 'jira',     'Jira NZ-300'),
  ('00000000-0000-4000-b000-000000000016', 'Monthly KPI report',                        null,                                   '00000000-0000-4000-a000-000000000003', null,                                   '0 days',   '5 days',   '5 days',   'medium', 'assigned',    15,  100, 'Reporting',         'KPI pack sent to leadership', 'Internal',                         5.0,  'agent',    'Agent: Monthly KPIs'),
  ('00000000-0000-4000-b000-000000000017', 'Client workshop with Al-Rajhi team',        '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000002', null,                                   '2 days',   '8 days',   '8 days',   'high',   'assigned',    0,   50,  'New account',       null, null,                                                          6.0,  'whatsapp', 'WhatsApp'),
  ('00000000-0000-4000-b000-000000000018', 'Attendance dashboard wireframes',           '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000007', null,                                   '-4 days',  '2 days',   '0 days',   'medium', 'submitted',   100, 100, 'Nizamy 2.4',        'Wireframes for 4 dashboard states', 'Internal',                   9.0,  'voice',    null),
  ('00000000-0000-4000-b000-000000000019', 'Update Nizamy roadmap for Q4',              '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000005', null,                                   '-1 day',   '6 days',   '6 days',   'medium', 'in_progress', 25,  75,  'Nizamy 2.4',        'Roadmap shared with sales and support', null,                    6.0,  'meeting',  'Teams meeting'),
  ('00000000-0000-4000-b000-000000000020', 'Data migration script for Wojood clients',  '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000006', null,                                   '0 days',   '9 days',   '11 days',  'high',   'in_progress', 15,  100, 'Wojood v2 launch',  'All 1,200 client records migrated and verified', 'Internal',     18.0, 'jira',     'Jira WJ-87'),
  ('00000000-0000-4000-b000-000000000021', 'Budget request for Riyadh event booth',     '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000004', null,                                   '-3 days',  '5 days',   '6 days',   'medium', 'blocked',     40,  100, 'Brand awareness',   'Approved budget and booth vendor booked', 'SAR 40,000',           4.0,  'email',    'Email'),
  ('00000000-0000-4000-b000-000000000022', 'Follow up on SPL contract draft',           '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000002', null,                                   '-2 days',  '1 day',    '1 day',    'high',   'in_progress', 65,  100, 'SPL client',        'Redlines agreed with SPL legal', 'Internal',                      3.0,  'voice',    null),
  ('00000000-0000-4000-b000-000000000023', 'Pitch to Elm team',                         '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000002', null,                                   '-10 days', '-3 days',  '-3 days',  'high',   'done',        100, 100, 'New account',       'Pitch delivered, next meeting booked', 'Internal',                10.0, 'voice',    null),
  ('00000000-0000-4000-b000-000000000024', 'Payroll edge-case tests',                   '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000006', null,                                   '-7 days',  '-2 days',  '-2 days',  'medium', 'done',        100, 100, 'Nizamy 2.4',        '40 edge cases automated', 'Internal',                             12.0, 'jira',     'Jira NZ-290'),
  ('00000000-0000-4000-b000-000000000025', 'Q2 board summary',                          null,                                   '00000000-0000-4000-a000-000000000003', null,                                   '-12 days', '-6 days',  '-6 days',  'high',   'done',        100, 100, 'Reporting',         '2-page summary approved', 'Internal',                             6.0,  'text',     null),
  ('00000000-0000-4000-b000-000000000026', 'Brand guideline refresh',                   '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000007', '-14 days', '-5 days',  '-5 days',  'medium', 'done',        100, 100, 'Brand awareness',   'Updated guideline PDF published', 'SAR 8,000',                    16.0, 'meeting',  'In-room meeting'),
  ('00000000-0000-4000-b000-000000000027', 'Mobile onboarding screens',                 '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000007', null,                                   '-6 days',  '-1 day',   '-1 day',   'medium', 'done',        100, 100, 'Nizamy 2.4',        'Final screens handed to Saad', 'Internal',                        10.0, 'voice',    null),
  ('00000000-0000-4000-b000-000000000028', 'Customer interviews (5)',                   '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000005', null,                                   '-11 days', '-4 days',  '-4 days',  'medium', 'done',        100, 100, 'Nizamy 2.4',        '5 interviews recorded with notes', 'Internal',                    8.0,  'text',     null),
  ('00000000-0000-4000-b000-000000000029', 'Invoice reconciliation for September',      null,                                   '00000000-0000-4000-a000-000000000003', null,                                   '-15 days', '-9 days',  '-10 days', 'medium', 'done',        100, 100, 'Cost control',      'All September invoices matched', 'Internal',                      7.0,  'email',    'Email'),
  ('00000000-0000-4000-b000-000000000030', 'Shortlist QA contractors',                  '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000005', null,                                   '-13 days', '-8 days',  '-8 days',  'low',    'done',        100, 100, 'Team growth',       '3 contractors shortlisted with rates', 'SAR 15,000/month',         4.0,  'whatsapp', 'WhatsApp')
) as v(id, title, ws, owner, helper, start_off, due_off, close_off, priority, status, progress, clarity, goal, dod, budget, est, source, source_ref)
on conflict (id) do nothing;

-- ─── Subtasks ─────────────────────────────────────────────────────────────────
insert into public.subtasks (task_id, title, owner_id, done, position) values
  ('00000000-0000-4000-b000-000000000005', 'Collect payroll rules from HR',            '00000000-0000-4000-a000-000000000005', true,  1),
  ('00000000-0000-4000-b000-000000000005', 'Map GOSI deductions',                      '00000000-0000-4000-a000-000000000003', true,  2),
  ('00000000-0000-4000-b000-000000000005', 'Write user stories',                       '00000000-0000-4000-a000-000000000005', false, 3),
  ('00000000-0000-4000-b000-000000000005', 'Review with Saad for feasibility',         '00000000-0000-4000-a000-000000000006', false, 4),
  ('00000000-0000-4000-b000-000000000007', 'Interview 3 employees about leave pain',   '00000000-0000-4000-a000-000000000007', true,  1),
  ('00000000-0000-4000-b000-000000000007', 'Draft new flow in Figma',                  '00000000-0000-4000-a000-000000000007', false, 2),
  ('00000000-0000-4000-b000-000000000007', 'Validate approval rules with Khalid',      '00000000-0000-4000-a000-000000000005', false, 3),
  ('00000000-0000-4000-b000-000000000015', 'Run regression suite',                     '00000000-0000-4000-a000-000000000006', true,  1),
  ('00000000-0000-4000-b000-000000000015', 'Fix P1 issues',                            '00000000-0000-4000-a000-000000000006', false, 2),
  ('00000000-0000-4000-b000-000000000015', 'Write sign-off doc',                       '00000000-0000-4000-a000-000000000006', false, 3);

-- ─── Evidence (metadata only; files arrive with S1-4) ─────────────────────────
insert into public.evidence (task_id, uploaded_by, type, title, storage_path, mime_type, duration_seconds) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', 'file',  'Deck v2',     '00000000-0000-4000-b000-000000000001/deck-v2.pdf',       'application/pdf', null),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', 'image', 'Whiteboard',  '00000000-0000-4000-b000-000000000001/whiteboard.jpg',    'image/jpeg', null),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003', 'file',  'Q3 numbers',  '00000000-0000-4000-b000-000000000001/q3-numbers.xlsx',   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', 'voice', 'Voice',       '00000000-0000-4000-b000-000000000001/voice-note.m4a',    'audio/m4a', 42),
  ('00000000-0000-4000-b000-000000000009', '00000000-0000-4000-a000-000000000005', 'file',  'Survey insights', '00000000-0000-4000-b000-000000000009/insights.pdf',  'application/pdf', null),
  ('00000000-0000-4000-b000-000000000018', '00000000-0000-4000-a000-000000000007', 'link',  'Figma wireframes', null, null, null);
update public.evidence set url = 'https://www.figma.com/file/attendance-dashboard'
 where task_id = '00000000-0000-4000-b000-000000000018' and type = 'link' and url is null;

-- ─── Follow-ups (plan for the SPL deck + a sample of sent/scheduled ones) ────
insert into public.followups (task_id, recipient_id, scheduled_at, channel, message, message_ar, status, sent_at) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', now() - interval '3 days',  'whatsapp', 'Hi Faisal, Ahmed asked you to prep the SPL deck by Thursday 5 PM. Abdullah can help with numbers. Can you confirm?', 'هلا فيصل، أحمد يبيك تجهز عرض SPL قبل الخميس الساعة ٥. عبدالله يساعدك بالأرقام. تأكد لي؟', 'replied', now() - interval '3 days'),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', now() + interval '1 day',   'in_app',   'Quick check: where are you on the SPL deck?', 'سؤال سريع: وين وصلت في عرض SPL؟', 'scheduled', null),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', now() + interval '2 days',  'in_app',   'Under 50%? I will flag it with a ready fix.', 'إذا أقل من ٥٠٪ بنبلغ أحمد ومعنا حل جاهز.', 'scheduled', null),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', now() + interval '4 days',  'in_app',   'Deadline today: please upload the final deck.', 'اليوم آخر موعد، ارفع العرض النهائي لو سمحت.', 'scheduled', null),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000003', now() - interval '25 minutes', 'in_app', 'How are the Q3 numbers going?', 'كيف أرقام الربع الثالث؟', 'replied', now() - interval '30 minutes'),
  ('00000000-0000-4000-b000-000000000006', '00000000-0000-4000-a000-000000000006', now() - interval '2 hours', 'push',     'The login timeout fix is due tomorrow. Any blockers?', 'إصلاح مشكلة تسجيل الدخول موعده بكرة. فيه شي معطلك؟', 'replied', now() - interval '2 hours'),
  ('00000000-0000-4000-b000-000000000010', '00000000-0000-4000-a000-000000000003', now() - interval '3 hours', 'whatsapp', 'Vendor renewal passed its due date. What new date works for you?', 'تجديد عقد المورد تأخر عن موعده. أي تاريخ جديد يناسبك؟', 'replied', now() - interval '3 hours'),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000004', now() - interval '1 day',   'in_app',   'Campaign plan check-in: how far along are you?', 'متابعة خطة الحملة: وين وصلتي؟', 'replied', now() - interval '1 day'),
  ('00000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-000000000005', now() - interval '1 day',   'in_app',   'Payroll requirements check-in.', 'متابعة متطلبات الرواتب.', 'replied', now() - interval '1 day'),
  ('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-a000-000000000002', now() - interval '1 day',   'push',     'Tender pack: are we on track for the Etimad deadline?', 'ملف المناقصة: ماشيين صح على موعد اعتماد؟', 'sent', now() - interval '1 day'),
  ('00000000-0000-4000-b000-000000000014', '00000000-0000-4000-a000-000000000004', now() - interval '5 hours', 'in_app',   'Landing page copy: anything you need from Maha?', 'نصوص صفحة الهبوط: تحتاجين شي من مها؟', 'replied', now() - interval '5 hours'),
  ('00000000-0000-4000-b000-000000000015', '00000000-0000-4000-a000-000000000006', now() - interval '4 hours', 'in_app',   'QA sign-off check-in.', 'متابعة اعتماد الاختبارات.', 'replied', now() - interval '4 hours'),
  ('00000000-0000-4000-b000-000000000019', '00000000-0000-4000-a000-000000000005', now() + interval '1 day',   'in_app',   'Roadmap update check-in.', 'متابعة تحديث خارطة الطريق.', 'scheduled', null),
  ('00000000-0000-4000-b000-000000000017', '00000000-0000-4000-a000-000000000002', now() + interval '2 hours', 'whatsapp', 'Al-Rajhi workshop: can you confirm the agenda and date?', 'ورشة الراجحي: تأكد لنا من الأجندة والموعد؟', 'scheduled', null),
  ('00000000-0000-4000-b000-000000000020', '00000000-0000-4000-a000-000000000006', now() + interval '3 days',  'in_app',   'Migration script progress check.', 'متابعة سكربت نقل البيانات.', 'scheduled', null);

-- ─── Reviews ──────────────────────────────────────────────────────────────────
insert into public.reviews (task_id, round, submitted_by, submission_note, reviewer_id, rating, criteria, note, decision, created_at, decided_at) values
  ('00000000-0000-4000-b000-000000000009', 1, '00000000-0000-4000-a000-000000000005', 'Top 10 insights attached, quotes in the appendix.', null, null, '{}', null, null, now() - interval '6 hours', null),
  ('00000000-0000-4000-b000-000000000018', 1, '00000000-0000-4000-a000-000000000007', 'Four states: empty, normal, late arrivals, month view.', null, null, '{}', null, null, now() - interval '3 hours', null),
  ('00000000-0000-4000-b000-000000000013', 1, '00000000-0000-4000-a000-000000000004', 'Benchmark for 6 competitors.', '00000000-0000-4000-a000-000000000001', 3, '{Quality}', 'Add annual vs monthly pricing and the source for each price.', 'sent_back', now() - interval '2 days', now() - interval '1 day'),
  ('00000000-0000-4000-b000-000000000023', 1, '00000000-0000-4000-a000-000000000002', 'Pitch done, follow-up meeting next week.', '00000000-0000-4000-a000-000000000001', 5, '{Quality,"On time",Communication}', 'Excellent work.', 'approved', now() - interval '4 days', now() - interval '3 days'),
  ('00000000-0000-4000-b000-000000000024', 1, '00000000-0000-4000-a000-000000000006', 'All 40 cases green.', '00000000-0000-4000-a000-000000000001', 5, '{Quality,"On time"}', null, 'approved', now() - interval '3 days', now() - interval '2 days'),
  ('00000000-0000-4000-b000-000000000025', 1, '00000000-0000-4000-a000-000000000003', 'Summary attached.', '00000000-0000-4000-a000-000000000001', 4, '{"On time"}', null, 'approved', now() - interval '7 days', now() - interval '6 days'),
  ('00000000-0000-4000-b000-000000000026', 1, '00000000-0000-4000-a000-000000000004', 'Guideline v3.', '00000000-0000-4000-a000-000000000001', 4, '{Quality,Communication}', null, 'approved', now() - interval '6 days', now() - interval '5 days'),
  ('00000000-0000-4000-b000-000000000027', 1, '00000000-0000-4000-a000-000000000007', 'Final screens in Figma.', '00000000-0000-4000-a000-000000000001', 5, '{Quality,"On time",Communication}', 'Beautiful Arabic layout.', 'approved', now() - interval '2 days', now() - interval '1 day'),
  ('00000000-0000-4000-b000-000000000028', 1, '00000000-0000-4000-a000-000000000005', 'Notes for 5 interviews.', '00000000-0000-4000-a000-000000000001', 4, '{Quality}', null, 'approved', now() - interval '5 days', now() - interval '4 days'),
  ('00000000-0000-4000-b000-000000000029', 1, '00000000-0000-4000-a000-000000000003', 'All matched.', '00000000-0000-4000-a000-000000000001', 4, '{"On time"}', null, 'approved', now() - interval '10 days', now() - interval '9 days'),
  ('00000000-0000-4000-b000-000000000030', 1, '00000000-0000-4000-a000-000000000005', 'Shortlist with rates.', '00000000-0000-4000-a000-000000000001', 3, '{Communication}', null, 'approved', now() - interval '9 days', now() - interval '8 days')
on conflict (task_id, round) do nothing;

-- ─── Achievements (from approved reviews) ─────────────────────────────────────
insert into public.achievements (profile_id, task_id, workspace_id, title, title_ar, rating, achieved_at)
select t.owner_id, t.id, t.workspace_id, t.title, null, r.rating, t.closed_at
  from public.tasks t
  join public.reviews r on r.task_id = t.id and r.decision = 'approved'
 where t.status = 'done'
   and not exists (select 1 from public.achievements a where a.task_id = t.id);

-- ─── Decisions (2 pending, 1 resolved) ────────────────────────────────────────
insert into public.decisions (id, task_id, manager_id, requested_by, type, title, title_ar, details, recommendation, recommendation_ar, recommendation_reason, status, resolved_by, resolved_at, created_at) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000010', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003',
   'extension_request', 'Abdullah asks 2 more days for the vendor renewal', 'عبدالله يطلب يومين زيادة لتجديد عقد المورد',
   '{"current_due_offset_days": -1, "requested_due_offset_days": 2, "employee_reason": "Legal has not returned the redlines yet."}',
   'Approve: legal review is the blocker, not Abdullah. The new date is still before the contract end.', 'وافق: التأخير من القانونية مو من عبدالله، والتاريخ الجديد قبل نهاية العقد.',
   'Legal has had the draft for 6 days; Abdullah replied to every follow-up within an hour.', 'pending', null, null, now() - interval '3 hours'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000011', '00000000-0000-4000-a000-000000000001', null,
   'delay_risk', 'Ministry tender may miss its date', 'مناقصة الوزارة ممكن تتأخر عن موعدها',
   '{"progress": 20, "days_left": 10, "load_hours": 52}',
   'Move the technical annex to Khalid so Faisal can focus on pricing and the SPL deck.', 'حوّل الملحق الفني لخالد عشان يتفرغ فيصل للتسعير وعرض SPL.',
   'Faisal is at 52 h this week (SPL deck + tender). Khalid is at 26 h and wrote the last tender annex.', 'pending', null, null, now() - interval '1 hour'),
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-b000-000000000006', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000006',
   'priority_question', 'Saad: bug fix before GOSI spec?', 'سعد: نصلّح الخلل قبل مواصفات التأمينات؟',
   '{}', 'Yes, the bug blocks the 2.4 release.', 'إيه، الخلل يوقف إصدار ٢.٤.', 'Release depends on it.', 'approved',
   '00000000-0000-4000-a000-000000000001', now() - interval '1 day', now() - interval '1 day 2 hours')
on conflict (id) do nothing;

-- ─── Activity log ─────────────────────────────────────────────────────────────
insert into public.activity_log (actor_type, actor_id, subject_id, task_id, action, summary, summary_ar, reason, undoable, created_at) values
  ('muntej', null, '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-b000-000000000001', 'followup_sent',   'Reminding Faisal about the SPL deck before Thu',            'أذكّر فيصل بعرض SPL قبل الخميس',                 'Due in 4 days, 40% done', false, now() - interval '10 minutes'),
  ('muntej', null, '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-b000-000000000002', 'update_received', 'Got Abdullah''s update: numbers 70% done',                  'وصلني تحديث عبدالله: الأرقام خلصت ٧٠٪',           null, false, now() - interval '25 minutes'),
  ('muntej', null, '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-b000-000000000001', 'meeting_set',     'Setting a 15-min sync for them tomorrow 10 AM',              'أرتب اجتماع ١٥ دقيقة بينهم بكرة الساعة ١٠ الصبح', 'Faisal needs the Q3 numbers to finish the deck', true, now() - interval '40 minutes'),
  ('muntej', null, '00000000-0000-4000-a000-000000000006', '00000000-0000-4000-b000-000000000006', 'update_received', 'Saad: login timeout fix is 80% done',                        'سعد: إصلاح مشكلة الدخول خلص ٨٠٪',                null, false, now() - interval '1 hour 50 minutes'),
  ('muntej', null, '00000000-0000-4000-a000-000000000006', '00000000-0000-4000-b000-000000000006', 'followup_sent',   'Checked in with Saad on the login timeout bug',              'تابعت مع سعد خلل انتهاء جلسة الدخول',              'Urgent, due tomorrow', false, now() - interval '2 hours'),
  ('muntej', null, '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-b000-000000000010', 'escalated',       'Vendor renewal is overdue: asked Abdullah for a new date',   'تجديد عقد المورد متأخر، سألت عبدالله عن تاريخ جديد', 'Passed due date by 1 day', false, now() - interval '3 hours'),
  ('muntej', null, '00000000-0000-4000-a000-000000000007', '00000000-0000-4000-b000-000000000018', 'submission_received', 'Maha submitted the attendance dashboard wireframes',     'مها سلّمت مخططات لوحة الحضور',                   null, false, now() - interval '3 hours'),
  ('muntej', null, '00000000-0000-4000-a000-000000000006', '00000000-0000-4000-b000-000000000015', 'update_received', 'Saad: QA regression suite passed, fixing P1s now',           'سعد: اختبارات الانحدار نجحت، يشتغل على الأولويات',  null, false, now() - interval '4 hours'),
  ('muntej', null, '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-b000-000000000014', 'followup_sent',   'Asked Noura if she needs anything from Maha for the copy',   'سألت نورة إذا تحتاج شي من مها للنصوص',              null, false, now() - interval '5 hours'),
  ('muntej', null, '00000000-0000-4000-a000-000000000005', '00000000-0000-4000-b000-000000000009', 'submission_received', 'Khalid submitted the survey analysis for review',       'خالد سلّم تحليل الاستبيان للمراجعة',               null, false, now() - interval '6 hours'),
  ('muntej', null, '00000000-0000-4000-a000-000000000007', '00000000-0000-4000-b000-000000000027', 'task_closed',     'Closed "Mobile onboarding screens": Maha sent the final files', 'قفلت "شاشات التسجيل": مها أرسلت الملفات النهائية', 'Approved with 5 stars', true, now() - interval '1 day'),
  ('muntej', null, '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-b000-000000000011', 'followup_sent',   'Asked Faisal if the tender is on track for Etimad',          'سألت فيصل إذا المناقصة ماشية على موعد اعتماد',      null, false, now() - interval '1 day'),
  ('muntej', null, '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-b000-000000000013', 'sent_back',       'Sent the pricing benchmark back to Noura with Ahmed''s note', 'رجّعت مقارنة الأسعار لنورة مع ملاحظة أحمد',       'Rated 3/5: needs annual pricing and sources', true, now() - interval '1 day'),
  ('muntej', null, '00000000-0000-4000-a000-000000000005', '00000000-0000-4000-b000-000000000005', 'update_received', 'Khalid: payroll requirements 55% done',                      'خالد: متطلبات الرواتب خلصت ٥٥٪',                 null, false, now() - interval '1 day 2 hours'),
  ('muntej', null, '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-b000-000000000004', 'task_created',    'Created "Social media calendar for November" from WhatsApp', 'سويت مهمة "تقويم السوشال لنوفمبر" من الواتساب',     'From Ahmed''s WhatsApp message', true, now() - interval '1 day 5 hours'),
  ('user',   '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000006', '00000000-0000-4000-b000-000000000006', 'decision_approved', 'Ahmed approved: bug fix before the GOSI spec',          'أحمد وافق: الإصلاح قبل مواصفات التأمينات',         null, false, now() - interval '1 day');

-- ─── Ahmed's settings, sources and one agent ──────────────────────────────────
insert into public.notification_prefs (profile_id, channels, rules) values
  ('00000000-0000-4000-a000-000000000001',
   '{"push": true, "email": true, "whatsapp": true, "teams": false}',
   '{"task_at_risk": {"enabled": true, "channels": ["push", "whatsapp"], "timing": "instant"},
     "task_overdue": {"enabled": true, "channels": ["push"], "timing": "instant"},
     "decision_waiting": {"enabled": true, "channels": ["push"], "timing": "instant"},
     "new_submission": {"enabled": true, "channels": ["push"]},
     "daily_summary": {"enabled": true, "channels": ["email"], "time": "08:00"},
     "weekly_report": {"enabled": false, "channels": ["email"], "day": "thu", "time": "16:00"}}')
on conflict (profile_id) do nothing;

insert into public.sources (owner_id, type, status, today_count) values
  ('00000000-0000-4000-a000-000000000001', 'whatsapp',     'connected',   12),
  ('00000000-0000-4000-a000-000000000001', 'email',        'connected',   5),
  ('00000000-0000-4000-a000-000000000001', 'meeting',      'connected',   3),
  ('00000000-0000-4000-a000-000000000001', 'sticky_note',  'connected',   1),
  ('00000000-0000-4000-a000-000000000001', 'teams',        'coming_soon', 0),
  ('00000000-0000-4000-a000-000000000001', 'slack',        'coming_soon', 0),
  ('00000000-0000-4000-a000-000000000001', 'google_chat',  'coming_soon', 0),
  ('00000000-0000-4000-a000-000000000001', 'jira',         'coming_soon', 0),
  ('00000000-0000-4000-a000-000000000001', 'azure_devops', 'coming_soon', 0)
on conflict (owner_id, type) do nothing;

insert into public.agents (id, owner_id, name, prompt, recipe, schedule, autonomy, enabled, last_run_at, run_count) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-a000-000000000001', 'Sunday overdue sweep',
   'Every Sunday at 8 AM, find overdue tasks and nudge their owners politely. Tell me only if something is more than 3 days late.',
   '{"trigger": {"type": "schedule", "cron": "0 8 * * 0"}, "find": {"status": ["assigned", "in_progress", "blocked"], "overdue": true}, "do": [{"action": "nudge_owner", "tone": "polite"}], "notify": {"when": "overdue_days > 3", "channel": "push"}}',
   '0 8 * * 0', 'always_run', true, now() - interval '6 days', 4)
on conflict (id) do nothing;
