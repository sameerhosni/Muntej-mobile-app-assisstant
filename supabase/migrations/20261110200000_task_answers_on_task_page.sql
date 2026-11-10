-- Reviewer, 10 Nov (R69): «جاوب» now also works on the task page (option 2): Saree3's announcement says so. The Home
-- "Needs you" spot stays its highlight (FEATURE_PLACES task_answers), the task page is where the question bar appears.
update public.features
   set benefit = 'When someone asks about a task''s due date, definition of done or budget, tap «Answer» on WhatsApp or on the task page itself and say it in your own words: it''s saved on the task and they''re told. The task page now shows those details too.',
       benefit_ar = 'لما أحد يسأل عن موعد مهمة أو تعريف إنجازها أو ميزانيتها، اضغط «جاوب» في الواتساب أو من صفحة المهمة نفسها وقلها بكلامك: تنحفظ في المهمة ويوصله الرد. وصفحة المهمة صارت تعرض هالتفاصيل كمان.'
 where key = 'task_answers';
