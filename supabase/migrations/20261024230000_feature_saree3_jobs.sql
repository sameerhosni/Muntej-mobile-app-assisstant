-- What's new: What I'm working on, Saree3 shows everything he's handling, retries by himself, and says when it's
-- done or exactly what he needs.
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('saree3_jobs', 'all', now(), 'See what I’m working on',
   'شوف وش قاعد أشتغل عليه',
   'Everything I’m handling for you, live: what needs you, what I’m on, who I’m waiting for and when I nudge them next. I retry by myself and tell you when it’s done.',
   'كل اللي ماسكه عنك، أول بأول: وش يحتاجك، وش أنا ماسكه، مين أنتظر ومتى أذكّره. أعيد المحاولة بنفسي وأبلّغك لما يخلص.', -15)
on conflict (key) do nothing;
