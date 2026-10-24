// sync-sources — every 10 minutes (pg_cron, x-cron-secret): reads what's new in every connected tool and passes it to
// Muntej's intake (sure tasks are added, the rest wait in Incoming). One connection at a time, each bounded.
// Each tool reads on its owner's schedule (connections.read_every_min): due ones only; 0 = manual ("Read now") only.
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
  const { data: conns, error } = await admin.from('connections').select('*').order('last_sync_at', { ascending: true, nullsFirst: true }).limit(200);
  if (error) throw error;
  const results = [];
  const now = Date.now();
  // a minute's slack: the job runs every 10 minutes, a tool set to 30 shouldn't wait 40
  const due = (c: { read_every_min?: number | null; last_sync_at?: string | null }) => {
    const every = c.read_every_min ?? 10;
    if (every === 0) return false;
    return !c.last_sync_at || now - Date.parse(c.last_sync_at) >= (every - 1) * 60_000;
  };
  for (const c of (conns ?? []).filter(due)) results.push({ provider: c.provider, ...(await syncConnection(admin, c)) });
  await deliverPending(admin);
  return json({ connections: results.length, results });
});
