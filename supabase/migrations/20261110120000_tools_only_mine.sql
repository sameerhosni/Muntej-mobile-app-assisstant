-- Nouran, 10 Nov: "we need only the ones addressed to me, and only me … tell it to disregard any task that is sent from
-- my email to others … to assign them to other users if they are already on Montej" and "we just need to improve the
-- discovery for it as I discovered it by chance". The reading itself is in supabase/functions/_shared/intake-core.ts;
-- this announces it (Saree3 lights up Home's "Needs you", where the tools' tasks wait).
insert into public.features (key, audience, released_at, testing, title, title_ar, benefit, benefit_ar, sort) values
  ('tools_only_mine', 'all', now(), true, 'Only your work from your tools',
   'من أدواتك: شغلك أنت بس',
   'Muntej now brings only what was asked of you from your mail and chats. What you ask a teammate becomes their task by itself, and what was already answered closes by itself. Find them on Home under "Needs you".',
   'منتج صار يجيب من إيميلك ومحادثاتك اللي انطلب منك أنت بس. اللي تطلبه من زميلك يصير مهمته لحاله، واللي انرد عليه ينقفل لحاله. تلقاها في الرئيسية تحت «يحتاجك».', -24)
on conflict (key) do nothing;
