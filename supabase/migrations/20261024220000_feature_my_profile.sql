-- What's new: My profile, everything Muntej knows about you in one page (tap your card in Settings).
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('my_profile', 'all', now(), 'Your full profile',
   'ملفك كامل',
   'Tap your card in Settings: name, email, mobile, role, job, manager, field, skills, accounts, all in one page.',
   'اضغط بطاقتك في الإعدادات: الاسم، الإيميل، الجوال، الدور، الوظيفة، المدير، المجال، المهارات، وحساباتك، كلها في صفحة وحدة.', -14)
on conflict (key) do nothing;
