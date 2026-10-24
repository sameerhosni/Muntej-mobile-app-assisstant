-- What's new: Google Chat → tasks (same as email: only real work people ask for, each waits for your OK).
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('google_chat', 'all', now(), 'Tasks from Google Chat',
   'مهام من قوقل شات',
   'Turn on Chat in your Google connection: I read your spaces and chats and bring the tasks people ask for, ready for your OK.',
   'شغّل الشات في ربط قوقل: أقرا مساحاتك ومحادثاتك وأجيب لك المهام اللي يطلبونها، جاهزة توافق عليها.', -12)
on conflict (key) do nothing;
