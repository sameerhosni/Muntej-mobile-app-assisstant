-- What's new: talk to the Muntej team from Saree3's menu (Intercom support chat).
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('support_chat', 'all', now(), 'Talk to the Muntej team',
   'كلّم فريق منتج',
   'A question, an idea or a problem? Tap me and choose “Talk to the Muntej team”: a real person answers.',
   'عندك سؤال، فكرة أو مشكلة؟ اضغطني واختر «كلّم فريق منتج»، ويرد عليك شخص من الفريق.', -19)
on conflict (key) do nothing;
