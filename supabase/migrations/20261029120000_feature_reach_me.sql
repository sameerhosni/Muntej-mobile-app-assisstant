-- What's new: "How should I reach you?" on Settings (owner, 28 Oct: "I get both push and WhatsApp; let each person
-- choose WhatsApp, app notifications or both"). It sets the push / WhatsApp channel switches the server already follows.
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('reach_me', 'all', now(), 'Choose how I reach you',
   'اختر كيف أوصل لك',
   'App notifications, WhatsApp or both: pick one in Settings and your alerts and daily reports come only that way.',
   'إشعارات التطبيق أو الواتساب أو الاثنين: اختر من الإعدادات، وتنبيهاتك وتقاريرك اليومية توصلك بس بهالطريقة.', -19)
on conflict (key) do nothing;
