-- Your shortcuts (owner, 20 Nov: "many icons in home page … something like android user experience here and open only
-- selected one"; "Both options in saree3 settings and the side bar one to be closed and opened easily"). The shortcut
-- row left Home: the places you pick open from a side tab on Home or from Saree3 (Settings → Saree3). Testers first.
insert into public.features (key, audience, released_at, testing, title, title_ar, benefit, benefit_ar, sort) values
  ('shortcuts', 'all', now(), true, 'Your shortcuts, from the side',
   'اختصاراتك من الجنب',
   'Home is lighter: tap the small tab on the side and the places you use most open; tap again to close. Prefer Saree3? Choose it in Settings, and pick your places there too.',
   'الرئيسية صارت أخف: اضغط اللسان الصغير على الجنب وتطلع الأماكن اللي تستخدمها كثير، واضغطه مرة ثانية يتسكّر. تبيها من سريع؟ اختر كذا في الإعدادات، واختر أماكنك من هناك.', -32)
on conflict (key) do nothing;
