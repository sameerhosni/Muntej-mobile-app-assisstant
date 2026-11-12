-- Owner, 12 Nov (Google Meet page, «اقرا الحين»): "How can I know it is finished". The read took 4 minutes, the app's
-- single call gave up after ~3 with «Failed to send a request to the Edge Function», while the server finished fine.
-- Now a read starts on the server and the app follows it on the connection row (option 1: one line per source).
--   connections.reading  null = never read this way; else
--     { state: 'reading' | 'done' | 'failed', by: 'you' | 'auto', started_at, finished_at,
--       sources: [{ key: 'gmail', total, read, done }], read, tasks, error_code, error }
--   claim_read           one read at a time per connection: a second tap or the 10-min job joins the running one;
--                        a read that started 8+ minutes ago and never finished is dead (function wall clock ~400 s)

alter table public.connections add column if not exists reading jsonb;

create or replace function public.claim_read(p_conn uuid, p_by text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  update public.connections
     set reading = jsonb_build_object('state', 'reading', 'by', p_by, 'started_at', now(), 'sources', '[]'::jsonb, 'read', 0, 'tasks', 0)
   where id = p_conn
     and (reading is null
          or reading->>'state' <> 'reading'
          or (reading->>'started_at')::timestamptz < now() - interval '8 minutes');
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.claim_read(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_read(uuid, text) to service_role;

insert into public.features (key, audience, released_at, testing, title, title_ar, benefit, benefit_ar, sort) values
  ('read_progress', 'all', now(), true, 'See when a read is finished',
   'تعرف متى خلصت القراءة',
   'Tap «Read now» and watch each part (Gmail, Chat, Meet) finish. You can leave the page: it keeps reading and shows «Done ✓» when you come back.',
   'اضغط «اقرا الحين» وتشوف كل جزء (Gmail وChat وMeet) يخلص. تقدر تطلع من الصفحة: أكمل القراءة وتلقى «خلصت ✓» لما ترجع.', -31)
on conflict (key) do nothing;
