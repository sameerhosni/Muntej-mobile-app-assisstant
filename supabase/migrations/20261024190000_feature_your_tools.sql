-- What's new: Your tools, one place for every connected tool, with Read now and your own reading schedule.
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('your_tools', 'all', now(), 'Your tools, on your schedule',
   'أدواتك، على جدولك',
   'Every connected tool in one place: what it brought, Read now, and how often I read it (10 minutes to once a day, or only when you ask).',
   'كل أدواتك في مكان واحد: وش جابت، اقرا الحين، وكل كم أقراها (من كل 10 دقائق لمرة باليوم، أو بس لما تطلب).', -13)
on conflict (key) do nothing;
