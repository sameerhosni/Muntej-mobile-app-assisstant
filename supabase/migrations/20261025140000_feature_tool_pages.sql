-- What's new: every tool has its own page (its tasks, what waits, Read now, settings, Disconnect).
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('tool_pages', 'all', now(), 'Every tool has its own page',
   'كل أداة لها صفحتها',
   'Open a tool from Your tools: what waits from it, the tasks it brought, how often I read it, and its settings, all in one place.',
   'افتح أي أداة من «أدواتك»: وش ينتظر منها، المهام اللي جابتها، كل كم أقراها، وإعداداتها، كلها في مكان واحد.', -17)
on conflict (key) do nothing;
