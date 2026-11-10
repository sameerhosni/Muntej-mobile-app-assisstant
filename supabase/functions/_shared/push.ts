// Push notifications through the Expo push service (it delivers via FCM on Android, APNs on iPhone,
// using the credentials stored in the Expo project, never here).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { localizeTexts } from './localize.ts';
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
 * The super admin's seats: a console, not a person at work. They never get a push, a WhatsApp or a report (owner,
 * 10 Nov: "Super admin should not receive notifications here. It should be a dashboard in the app"); what they'd have
 * said waits on the dashboard. Their alerts still land on the Alerts screen.
 */
export async function consoleSeats(admin: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return new Set();
  const { data } = await admin.from('profiles').select('id').in('id', list).eq('role', 'super_admin');
  return new Set((data ?? []).map((r) => r.id as string));
}

/**
 * For people with seats in more than one company (one login or one phone): the company name each message starts
 * with, "T2 · …", so two messages on one phone can't be mixed up (owner, 10 Nov). Console seats don't count.
 */
export async function companyTags(admin: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return out;
  const { data: me } = await admin.from('profiles').select('id, user_id, phone, account_id, account:accounts(name)').in('id', list);
  const rows = (me ?? []) as unknown as { id: string; user_id: string | null; phone: string | null; account_id: string; account: { name: string } | null }[];
  const users = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
  const phones = [...new Set(rows.map((r) => r.phone).filter(Boolean))] as string[];
  const ors = [users.length && `user_id.in.(${users.join(',')})`, phones.length && `phone.in.(${phones.map((p) => `"${p}"`).join(',')})`].filter(Boolean);
  if (!ors.length) return out;
  const { data: seats } = await admin
    .from('profiles')
    .select('user_id, phone, account_id')
    .or(ors.join(','))
    .eq('status', 'active')
    .eq('hidden', false)
    .neq('role', 'super_admin');
  for (const r of rows) {
    const companies = new Set(
      (seats ?? []).filter((s) => (r.user_id && s.user_id === r.user_id) || (r.phone && s.phone === r.phone)).map((s) => s.account_id as string),
    );
    if (companies.size > 1 && r.account?.name) out.set(r.id, r.account.name);
  }
  return out;
}

/**
 * Sends one message to every device of each person. Returns how many devices it went to.
 * Tokens Expo reports as no longer registered are removed.
 */
export async function sendPush(profileIds: string[], msg: PushMessage, admin = adminClient()): Promise<number> {
  let ids = [...new Set(profileIds.filter(Boolean))];
  // the super admin's console seat never gets a push (its dashboard has it); their other seats still do
  const consoles = await consoleSeats(admin, ids);
  ids = ids.filter((id) => !consoles.has(id));
  if (!ids.length) return 0;
  // one person with seats in two companies: the push says which company it's about ("T2 · …")
  if (ids.length === 1) {
    const tag = (await companyTags(admin, ids)).get(ids[0]);
    if (tag && !msg.title.startsWith(`${tag} · `)) msg = { ...msg, title: `${tag} · ${msg.title}` };
  }
  // one login can be in several accounts (one profile each): its phone was registered under one of them
  const { data: logins } = await admin.from('profiles').select('user_id').in('id', ids).not('user_id', 'is', null);
  const userIds = [...new Set((logins ?? []).map((r) => r.user_id as string))];
  if (userIds.length) {
    const { data: same } = await admin.from('profiles').select('id').in('user_id', userIds);
    ids = [...new Set([...ids, ...(same ?? []).map((r) => r.id as string)])];
  }
  const { data: rows, error } = await admin.from('push_tokens').select('token, profile_id').in('profile_id', ids);
  if (error) throw error;
  const tokens = (rows ?? []).map((r) => r.token as string);
  if (!tokens.length) return 0;
  // someone who chose Hindi reads it in Hindi, whoever wrote the message (Arabic and English are written by each sender)
  const { data: hindi } = await admin.from('profiles').select('id').in('id', ids).eq('locale', 'hi');
  // the translation is done by the AI: only for people who allowed it, the others read the original
  const allowed = await Promise.all((hindi ?? []).map(async (p) => ((await admin.rpc('ai_allowed', { p_profile: p.id })).data === true ? (p.id as string) : null)));
  const hiPeople = new Set(allowed.filter((x): x is string => !!x));
  const hiTokens = new Set((rows ?? []).filter((r) => hiPeople.has(r.profile_id as string)).map((r) => r.token as string));
  const [hiTitle, hiBody] = hiTokens.size ? await localizeTexts(admin, 'hi', [msg.title, msg.body]) : [msg.title, msg.body];

  let sent = 0;
  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        batch.map((to) => ({
          to,
          title: rtlSafe(isolate(shapeTitle(hiTokens.has(to) ? hiTitle : msg.title))),
          body: rtlSafe(isolate(shapeBody(hiTokens.has(to) ? hiBody : msg.body))),
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
