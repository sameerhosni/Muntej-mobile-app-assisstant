-- Told apart from the Hindi migration: that one has to go live first (the strings are generated through it), and nobody
-- should hear about Hindi until the app that has it is out. Apply only as part of the release.
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('hindi_language', 'all', now(), 'Muntej in Hindi',
   'منتج بالهندي',
   'Anyone on your team can choose Hindi in Settings. Their tasks and messages reach them in Hindi. Arabic stays the default.',
   'أي أحد في فريقك يقدر يختار الهندي من الإعدادات، وتوصله مهامه ورسائله بالهندي. والعربي يبقى الأساس.', -22)
on conflict (key) do nothing;
