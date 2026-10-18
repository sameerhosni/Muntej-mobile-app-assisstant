-- One-off data fix: Arabic titles for the seeded achievements (seed.sql left title_ar null).
update public.achievements a
   set title_ar = v.title_ar
  from (values
    ('Pitch to Elm team', 'عرض لفريق علم'),
    ('Payroll edge-case tests', 'اختبارات حالات الرواتب الخاصة'),
    ('Q2 board summary', 'ملخص مجلس الإدارة للربع الثاني'),
    ('Brand guideline refresh', 'تحديث دليل الهوية'),
    ('Mobile onboarding screens', 'شاشات التسجيل للجوال'),
    ('Customer interviews (5)', 'مقابلات العملاء (٥)'),
    ('Invoice reconciliation for September', 'مطابقة فواتير سبتمبر'),
    ('Shortlist QA contractors', 'قائمة مختصرة لمقاولي الاختبار')
  ) as v(title, title_ar)
 where a.title = v.title and a.title_ar is null;
select count(*) filter (where title_ar is not null) as with_ar, count(*) as total from public.achievements;
