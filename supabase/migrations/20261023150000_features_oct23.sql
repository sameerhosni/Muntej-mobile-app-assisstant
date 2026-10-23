-- What's new (23 Oct): each gets a "New for you" card; "Show me" runs Saree3's walkthrough on the feature itself and it
-- counts as seen only when they finish it (skipped → asked again later). Negative sort = offered before older ones.
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('from_saree3', 'all', now(), 'From Saree3, on Home',
   'من سريع، في الرئيسية',
   'Each time you open the app: what happened since your last visit, what I did about it, and what needs you.',
   'كل ما تفتح التطبيق: وش صار من آخر مرة، وش سويت أنا، ووش يحتاجك.', -6),
  ('team_risks', 'manager', now(), 'Risks and achievements on Home',
   'المخاطر والإنجازات في الرئيسية',
   'Late, blocked and urgent work across your team, with what I am doing about each, plus this week''s wins.',
   'المتأخر والواقف والعاجل في فريقك، ووش قاعد أسوي في كل وحدة، وإنجازات الأسبوع.', -5),
  ('email_tasks', 'all', now(), 'Tasks from your email',
   'مهام من إيميلك',
   'Connect Gmail or Outlook: I read new mail and bring you the tasks with owner, date and details, ready to add.',
   'اربط جيميل أو أوتلوك: أقرا الإيميلات الجديدة وأجيب لك المهام بمسؤولها وموعدها وتفاصيلها، جاهزة تضيفها.', -4),
  ('whatsapp', 'all', now(), 'Voice notes on WhatsApp → tasks',
   'رسائل الواتساب الصوتية ← مهام',
   'Forward any voice note or message to Muntej on WhatsApp and I turn it into tasks for your OK.',
   'حوّل أي رسالة صوتية أو نص لمنتج على الواتساب، وأحولها لمهام توافق عليها.', -3),
  ('meet', 'manager', now(), 'Google Meet and Calendar',
   'قوقل ميت والتقويم',
   'After a meeting I read the transcript and bring you who does what. Switch Gmail, Calendar or Meet on or off.',
   'بعد الاجتماع أقرا المحضر وأجيب لك مين يسوي وش. وتقدر تشغّل أو تطفي جيميل والتقويم وميت.', -2),
  ('more_tools', 'all', now(), 'All your tools in one place',
   'كل أدواتك في مكان واحد',
   'Outlook, WhatsApp, Jira, ClickUp, Trello and Slack: see which are connected and connect the rest in one tap.',
   'أوتلوك، واتساب، جيرا، كليك أب، تريلو وسلاك: شوف وش مربوط واربط الباقي بضغطة.', -1)
on conflict (key) do nothing;
