// webhook-dispatch — every minute (pg_cron, x-cron-secret, only when something is due): sends pending webhook
// deliveries (public.webhook_deliveries) to the subscriber's URL, signed:
//   POST <url>  body {"id","event","created_at","account_id","data"}
//   X-Muntej-Event: task.created · X-Muntej-Delivery: <id> · X-Muntej-Timestamp: <unix s>
//   X-Muntej-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<body>")>
// 2xx = sent. Anything else: retried after 1 m, 5 m, 30 m, 2 h, 12 h, then "failed".
import { HttpError, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/push.ts';

const BACKOFF_MIN = [1, 5, 30, 120, 720];
const TIMEOUT_MS = 8000;

async function hmacHex(secret: string, text: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) throw new HttpError(401, 'Not allowed');
  const admin = adminClient();
  const { data: due, error } = await admin
    .from('webhook_deliveries')
    .select('id, attempts, webhook:webhooks(id, url, secret, active), event:webhook_events(id, account_id, event, payload, created_at)')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at')
    .limit(100);
  if (error) throw error;

  let sent = 0;
  let failed = 0;
  for (const d of due ?? []) {
    const hook = d.webhook as unknown as { id: string; url: string; secret: string; active: boolean } | null;
    const ev = d.event as unknown as { id: number; account_id: string; event: string; payload: unknown; created_at: string } | null;
    if (!hook?.active || !ev) {
      await admin.from('webhook_deliveries').update({ status: 'failed', last_error: 'webhook removed' }).eq('id', d.id);
      continue;
    }
    const body = JSON.stringify({ id: ev.id, event: ev.event, created_at: ev.created_at, account_id: ev.account_id, data: ev.payload });
    const ts = Math.floor(Date.now() / 1000).toString();
    let ok = false;
    let err = '';
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Muntej-Webhooks/1',
          'X-Muntej-Event': ev.event,
          'X-Muntej-Delivery': String(d.id),
          'X-Muntej-Timestamp': ts,
          'X-Muntej-Signature': `sha256=${await hmacHex(hook.secret, `${ts}.${body}`)}`,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      ok = res.ok;
      if (!ok) err = `HTTP ${res.status}`;
    } catch (e) {
      err = (e as Error).message.slice(0, 200);
    }
    const attempts = d.attempts + 1;
    if (ok) {
      sent++;
      await admin.from('webhook_deliveries').update({ status: 'sent', attempts, last_error: null }).eq('id', d.id);
    } else if (attempts > BACKOFF_MIN.length) {
      failed++;
      await admin.from('webhook_deliveries').update({ status: 'failed', attempts, last_error: err }).eq('id', d.id);
    } else {
      await admin
        .from('webhook_deliveries')
        .update({ attempts, last_error: err, next_attempt_at: new Date(Date.now() + BACKOFF_MIN[attempts - 1] * 60_000).toISOString() })
        .eq('id', d.id);
    }
  }
  return json({ due: due?.length ?? 0, sent, failed });
});
