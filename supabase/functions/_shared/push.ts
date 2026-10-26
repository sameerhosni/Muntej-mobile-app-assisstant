// Push notifications through the Expo push service (it delivers via FCM on Android, APNs on iPhone,
// using the credentials stored in the Expo project, never here).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { requireEnv } from './http.ts';

/** categoryId: the app's notification buttons (e.g. 'checkin' = Done / On track / Blocked) */
export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  categoryId?: string;
  /** an optional picture (shown on the right); the logo itself is the notification icon (left), from the app build */
  image?: string | null;
};

const ARABIC = /[؀-ۿ]/;
const RLM = '‏';
/** Arabic text reads right to left even when a line starts with a Latin name ("Sameer: عدّلت…"): the phone takes a
 *  line's direction from its first letter, so each line starts with a right-to-left mark */
export function rtlSafe(text: string): string {
  if (!ARABIC.test(text)) return text;
  return text
    .split('\n')
    .map((l) => (l.startsWith(RLM) ? l : RLM + l))
    .join('\n');
}

const FSI = '\u2068';
const PDI = '\u2069';
const TITLE_MAX = 46;
const BODY_MAX = 180;

/** a quoted name («…» or "…") on its own direction island, so "«Call client tomorrow» ناقصها شي" keeps its order */
const isolate = (s: string) => s.replace(/([«"“])([^»"”\n]+)([»"”])/g, (_m, a, x, b) => `${a}${FSI}${x}${PDI}${b}`);

/** short title: the quoted name is cut first ("«Call client tomo…» ناقصها شي"), then the whole line */
export function shapeTitle(t: string): string {
  if (t.length <= TITLE_MAX) return t;
  const q = t.match(/([«"“])([^»"”\n]+)([»"”])/);
  if (q) {
    const over = t.length - TITLE_MAX;
    const keep = Math.max(8, q[2].length - over - 1);
    if (keep < q[2].length) t = t.replace(q[0], `${q[1]}${q[2].slice(0, keep).trim()}…${q[3]}`);
  }
  return t.length <= TITLE_MAX + 4 ? t : `${t.slice(0, TITLE_MAX).trim()}…`;
}

/** body: at most ~3 lines on a phone */
const shapeBody = (b: string) => (b.length <= BODY_MAX ? b : `${b.slice(0, BODY_MAX).trim()}…`);

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
  let ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return 0;
  // one login can be in several accounts (one profile each): its phone was registered under one of them
  const { data: logins } = await admin.from('profiles').select('user_id').in('id', ids).not('user_id', 'is', null);
  const userIds = [...new Set((logins ?? []).map((r) => r.user_id as string))];
  if (userIds.length) {
    const { data: same } = await admin.from('profiles').select('id').in('user_id', userIds);
    ids = [...new Set([...ids, ...(same ?? []).map((r) => r.id as string)])];
  }
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
        batch.map((to) => ({
          to,
          title: rtlSafe(isolate(shapeTitle(msg.title))),
          body: rtlSafe(isolate(shapeBody(msg.body))),
          data: msg.data ?? {},
          sound: 'default',
          channelId: 'muntej',
          priority: 'high',
          ...(msg.categoryId ? { categoryId: msg.categoryId } : {}),
          ...(msg.image ? { richContent: { image: msg.image } } : {}),
        })),
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
