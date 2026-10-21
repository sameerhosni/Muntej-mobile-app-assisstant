// sync-sources — every 10 minutes (pg_cron, x-cron-secret): reads what's new in every connected tool and passes it to
// Muntej's intake (sure tasks are added, the rest wait in Incoming). One connection at a time, each bounded.
import { HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';
import { syncConnection } from '../_shared/connections.ts';
import { deliverPending } from '../_shared/notify.ts';

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) throw new HttpError(401, 'Not allowed');
  const admin = adminClient();
  // a connection in error is retried too (a token that came back to life, a tool that was down)
  const { data: conns, error } = await admin.from('connections').select('*').order('last_sync_at', { ascending: true, nullsFirst: true }).limit(50);
  if (error) throw error;
  const results = [];
  for (const c of conns ?? []) results.push({ provider: c.provider, ...(await syncConnection(admin, c)) });
  await deliverPending(admin);
  return json({ connections: results.length, results });
});
