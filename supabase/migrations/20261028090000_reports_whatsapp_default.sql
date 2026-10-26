-- Owner, 28 Oct: the reports never reached WhatsApp (the morning rule was saved as push + email). Everyone with a mobile
-- gets the three reports on WhatsApp too; turning WhatsApp off in Alerts still stops it.
update public.notification_prefs np
   set rules = jsonb_set(np.rules, '{daily_summary,channels}', (np.rules -> 'daily_summary' -> 'channels') || '["whatsapp"]'::jsonb)
  from public.profiles p
 where p.id = np.profile_id
   and p.phone is not null
   and jsonb_typeof(np.rules -> 'daily_summary' -> 'channels') = 'array'
   and not (np.rules -> 'daily_summary' -> 'channels') ? 'whatsapp';
