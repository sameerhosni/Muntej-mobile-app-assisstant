-- The owner, 11 Nov: "I have many of the tasks should be approved or reviewed from my side… if I went to the page of
-- the decisions, I have nothing there". One «يحتاجك» (option 2): the Decisions tab holds everything waiting on you, with
-- filters, and the same count on the tab, Home, Tasks and WhatsApp. Testers first; Saree3 announces it.
insert into public.features (key, audience, released_at, testing, title, title_ar, benefit, benefit_ar, sort) values
  ('one_needs_you', 'all', now(), true, 'Everything waiting on you, in one place',
   'كل اللي ينتظرك في مكان واحد',
   'The Decisions tab is now «Needs you»: requests, finished work to approve, questions, comments and cancel requests, with filters at the top. The same number shows on the tab, Home, Tasks and WhatsApp.',
   'تبويب القرارات صار «يحتاجك»: الطلبات، والشغل اللي ينتظر اعتمادك، والأسئلة، والتعليقات، وطلبات الإلغاء، مع فلاتر فوق. ونفس الرقم في التبويب والرئيسية والمهام والواتساب.', -28)
on conflict (key) do nothing;
