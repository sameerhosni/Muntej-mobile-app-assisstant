-- What's new: your Muntej journey (value ladder) on Home.
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('journey_ladder', 'manager', now(), 'Your Muntej journey',
   'رحلتك مع منتج',
   'See the next step to “create it and forget it”: say a task, hand it off, and let me follow up for you. I celebrate each one with you.',
   'شوف خطوتك الجاية لـ«أنشئها وانساها»: قل المهمة، سلّمها، وخلّني أتابعها عنك. وأحتفل معك بكل خطوة.', -18)
on conflict (key) do nothing;
