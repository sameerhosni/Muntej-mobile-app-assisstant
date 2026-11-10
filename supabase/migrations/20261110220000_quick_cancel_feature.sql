-- Saree3 announces the quick Cancel (owner, 10 Nov): the ✕ on each task in the list, «رجّعها» for 6 seconds, and
-- «اطلب إلغاءها» for a task someone else gave you. Testers first; ship --live turns it on for everyone.
insert into public.features (key, audience, released_at, testing, title, title_ar, benefit, benefit_ar, sort) values
  ('quick_cancel', 'all', now(), true, 'Cancel a task in one tap',
   'ألغِ المهمة بضغطة',
   'A task you don''t need any more? Tap ✕ next to it in your tasks (or «Cancel» on the task page): it asks once, and «Bring it back» stays for 6 seconds if you change your mind. Given to you by someone else? «Ask to cancel» and they decide.',
   'مهمة ما عاد لها داعي؟ اضغط ✕ جنبها في مهامك (أو «ألغها» من صفحتها): يسألك مرة، و«رجّعها» تبقى ٦ ثواني لو غيّرت رأيك. وإذا عطاك إياها أحد، اضغط «اطلب إلغاءها» والقرار له.', -26)
on conflict (key) do nothing;
