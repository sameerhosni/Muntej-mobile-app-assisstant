-- What needs the manager reaches WhatsApp too (owner, 2 Nov: employees answered on WhatsApp — more time, help, done —
-- and he got only a push). The old defaults sent "late / help asked", "decision waiting" and "new to review" by push
-- only; every rule still on that old default (exactly ["push"]) gets WhatsApp added. Rules someone changed stay as
-- they are; the global WhatsApp switch still wins.
update public.notification_prefs np
set rules = (
  select jsonb_object_agg(
           k,
           case when k in ('task_overdue', 'decision_waiting', 'new_submission') and v -> 'channels' = '["push"]'::jsonb
                then jsonb_set(v, '{channels}', '["push", "whatsapp"]'::jsonb)
                else v end)
  from jsonb_each(np.rules) as r(k, v)
)
where jsonb_typeof(np.rules) = 'object'
  and exists (
    select 1 from jsonb_each(np.rules) as r(k, v)
    where k in ('task_overdue', 'decision_waiting', 'new_submission') and v -> 'channels' = '["push"]'::jsonb
  );
