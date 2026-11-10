-- Reviewer, 10 Nov (R69 / R83): the new tools reading and «✍️ جاوب» go to testers first, like every feature. The tools
-- reader and WhatsApp run as the server, not as the person: feature_on_for asks for a given person.
create or replace function public.feature_on_for(p_key text, p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- a tester is the login, like is_tester(): any of its seats with the flag (reviewer, 10 Nov)
  select coalesce((select not f.testing or exists (select 1 from public.profiles me join public.profiles p on p.user_id = me.user_id
                                                   where me.id = p_profile and p.tester and p.status <> 'deleted')
                       or coalesce((select p.tester from public.profiles p where p.id = p_profile), false)
                     from public.features f where f.key = p_key), true);
$$;
revoke all on function public.feature_on_for(text, uuid) from public, anon, authenticated;

-- «✍️ جاوب»: answer an employee's question on WhatsApp, and it fills the task (announced by Saree3)
insert into public.features (key, audience, released_at, testing, title, title_ar, benefit, benefit_ar, sort) values
  ('task_answers', 'manager', now(), true, 'Answer questions right from WhatsApp',
   'جاوب الأسئلة من الواتساب',
   'When someone asks about a task''s due date, definition of done or budget, tap «Answer» on WhatsApp and say it in your own words: it''s saved on the task and they''re told.',
   'لما أحد يسأل عن موعد مهمة أو تعريف إنجازها أو ميزانيتها، اضغط «جاوب» في الواتساب وقلها بكلامك: تنحفظ في المهمة ويوصله الرد.', -25)
on conflict (key) do nothing;
