-- What's new (24 Oct): screens that were only reachable from the screen list are now part of the journey.
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('week_links', 'manager', now(), 'Your week in one tap',
   'أسبوعك بضغطة',
   'Under this week''s achievements: the receipt of what I saved you, team performance and every win. Thursdays I send the receipt myself.',
   'تحت إنجازات الأسبوع: إيصال اللي وفّرته لك، أداء الفريق، وكل الإنجازات. وكل خميس أرسل لك الإيصال بنفسي.', -9),
  ('objective_plan', 'manager', now(), 'The full plan, from any objective',
   'الخطة كاملة، من أي هدف',
   'Open an objective and see every project on one timeline, with my forecast and one-tap fixes when something slips.',
   'افتح أي هدف وشوف كل المشاريع على خط زمني واحد، مع توقعاتي وتعديل بضغطة لو شي تأخر.', -8)
on conflict (key) do nothing;
