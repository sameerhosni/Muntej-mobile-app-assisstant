-- What's new: send Saree3 a WhatsApp voice note or text, he replies with each task and Approve / Ignore buttons.
insert into public.features (key, audience, released_at, title, title_ar, benefit, benefit_ar, sort) values
  ('whatsapp_approve', 'all', now(), 'Give me tasks on WhatsApp',
   'عطني مهامك على واتساب',
   'Send a voice note or a text to Muntej’s WhatsApp (+966 11 520 9855). I reply with each task, who it’s for and when, with Approve / Ignore buttons. One tap and I take it from there.',
   'أرسل رسالة صوتية أو نص لواتساب منتج (+966 11 520 9855). أرد عليك بكل مهمة، لمين وإمتى، وتحتها زر اعتمد أو تجاهل. ضغطة وحدة وأنا أكمّل الباقي.', -16)
on conflict (key) do nothing;
