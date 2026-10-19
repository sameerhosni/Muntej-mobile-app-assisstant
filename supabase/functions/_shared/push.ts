// Push notifications through the Expo push service (it delivers via FCM on Android, APNs on iPhone,
// using the credentials stored in the Expo project, never here).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { requireEnv } from './http.ts';

export type PushMessage = { title: string; body: string; data?: Record<string, unknown> };

/** Service-role client: push tokens are private to their owners, so only the server may read other people's. */
export function adminClient(): SupabaseClient {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? requireEnv('SUPABASE_SECRET_KEY');
  return createClient(requireEnv('SUPABASE_URL'), key, { auth: { persistSession: false } });
}

/**
 * Sends one message to every device of each person. Returns how many devices it went to.
 * Tokens Expo reports as no longer registered are removed.
 */
export async function sendPush(profileIds: string[], msg: PushMessage, admin = adminClient()): Promise<number> {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return 0;
  const { data: rows, error } = await admin.from('push_tokens').select('token').in('profile_id', ids);
  if (error) throw error;
  const tokens = (rows ?? []).map((r) => r.token as string);
  if (!tokens.length) return 0;

  let sent = 0;
  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        batch.map((to) => ({ to, title: msg.title, body: msg.body, data: msg.data ?? {}, sound: 'default', channelId: 'muntej', priority: 'high' })),
      ),
    });
    if (!res.ok) {
      console.error('Expo push error', res.status, await res.text());
      continue;
    }
    const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    const dead: string[] = [];
    (out.data ?? []).forEach((ticket, k) => {
      if (ticket.status === 'ok') sent++;
      else if (ticket.details?.error === 'DeviceNotRegistered') dead.push(batch[k]);
      else console.warn('push ticket error', ticket);
    });
    if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
  }
  return sent;
}
