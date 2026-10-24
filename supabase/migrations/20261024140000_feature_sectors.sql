-- What's new: tools by field of work, and your requests with their answers on Home.
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('sectors', 'all', now(), 'Your tools first',
   'أدواتك أول شي',
   'Tell me your field (sales, tech, product, operations, HR) and I show the tools you actually use first.',
   'قل لي مجالك (مبيعات، تقنية، منتج، عمليات، موارد بشرية) وأحط لك الأدوات اللي تستخدمها أول شي.', -11),
  ('my_requests', 'employee', now(), 'See the answer to what you asked',
   'شوف رد طلبك',
   'Asked for more time or help? It shows on Home: waiting, then the answer and the new date. I chase it for you.',
   'طلبت وقت زيادة أو مساعدة؟ تشوفه في الرئيسية: ننتظر الرد، بعدين الجواب والموعد الجديد. وأنا أتابعه عنك.', -10)
on conflict (key) do nothing;
