-- What's new: Saree3 hands each new task over and gets the answer (Got it · Need time · Need help), on the message
-- and on Home. Nobody has to tell anyone they got a task.
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('confirm_new', 'all', now(), 'Answer new tasks in one tap',
   'رد على المهام الجديدة بضغطة',
   'Got it, need more time or need help, right on my message. I handle the rest with your manager.',
   'استلمت، أحتاج وقت، أو أحتاج مساعدة، من رسالتي مباشرة. والباقي أتفاهم فيه أنا مع مديرك.', -7)
on conflict (key) do nothing;
