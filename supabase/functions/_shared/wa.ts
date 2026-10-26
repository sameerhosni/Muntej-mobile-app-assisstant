// WhatsApp Cloud API helpers shared by the whatsapp webhook, the reports (daily-summary) and alerts (notify):
// texts, reply buttons, lists and approved templates; the 24-hour window; and acting as the person who wrote
// (a real short-lived session, so everything they do from WhatsApp runs with their own permissions, like the app).
// Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID; templates WHATSAPP_REPORT_TEMPLATE / WHATSAPP_ACTION_TEMPLATE (default
// muntej_report / muntej_action, created by the whatsapp function's setup action and approved by Meta).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const GRAPH = 'https://graph.facebook.com/v21.0';
/** Meta's window is 24 h after the person's last message; keep a margin */
const WINDOW_MS = 23.5 * 3_600_000;

export type WaButton = { id: string; title: string };
export type WaRow = { id: string; title: string; description?: string };

/** dry run (the whatsapp function's server-only "simulate"): messages are collected here instead of being sent */
export const capture: { on: boolean; out: unknown[] } = { on: false, out: [] };

async function send(phone: string, message: Record<string, unknown>): Promise<boolean> {
  if (capture.on) return (capture.out.push(message), true);
  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneId = Deno.env.get('WHATSAPP_PHONE_ID');
  if (!token || !phoneId) return false;
  const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...(phone ? { to: phone.replace(/\D/g, '') } : {}), ...message }),
  });
  if (!res.ok) console.error('WhatsApp send error', message.type, res.status, (await res.text()).slice(0, 300));
  return res.ok;
}

export const waText = (phone: string, text: string) => send(phone, { type: 'text', text: { body: text.slice(0, 4096) } });

/** up to 3 reply buttons (titles ≤ 20 characters) */
export const waButtons = (phone: string, body: string, buttons: WaButton[], footer?: string) =>
  send(phone, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body.slice(0, 1024) },
      ...(footer ? { footer: { text: footer.slice(0, 60) } } : {}),
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) },
    },
  });

/** a "choose one" list (up to 10 rows; title ≤ 24, description ≤ 72) behind one button */
export const waList = (phone: string, body: string, button: string, rows: WaRow[], footer?: string) =>
  send(phone, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body.slice(0, 1024) },
      ...(footer ? { footer: { text: footer.slice(0, 60) } } : {}),
      action: {
        button: button.slice(0, 20),
        sections: [
          {
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id.slice(0, 200),
              title: r.title.slice(0, 24),
              ...(r.description ? { description: r.description.slice(0, 72) } : {}),
            })),
          },
        ],
      },
    },
  });

/** an approved template (outside the 24 h window): body parameters + one quick-reply button carrying `payload` */
export const waTemplate = (phone: string, name: string, lang: 'ar' | 'en', params: string[], payload?: string) =>
  send(phone, {
    type: 'template',
    template: {
      name,
      language: { code: lang },
      components: [
        // template parameters can't hold new lines, tabs or 4+ spaces in a row
        { type: 'body', parameters: params.map((p) => ({ type: 'text', text: p.replace(/[\n\t]+/g, ' · ').replace(/ {4,}/g, ' ').slice(0, 900) })) },
        ...(payload ? [{ type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload }] }] : []),
      ],
    },
  });

/** blue ticks + "typing…" while Saree3 thinks (Meta shows it up to 25 s or until the reply) */
export const waTyping = (messageId: string) =>
  send('', { status: 'read', message_id: messageId, typing_indicator: { type: 'text' } });

export const REPORT_TEMPLATE =() => Deno.env.get('WHATSAPP_REPORT_TEMPLATE') ?? 'muntej_report';
export const ACTION_TEMPLATE = () => Deno.env.get('WHATSAPP_ACTION_TEMPLATE') ?? 'muntej_action';

/** may we write freely (the person wrote to Muntej in the last 24 h)? */
export const inWindow = (lastInbound: string | null | undefined) => !!lastInbound && Date.now() - Date.parse(lastInbound) < WINDOW_MS;

export const waConfigured = () => !!Deno.env.get('WHATSAPP_TOKEN') && !!Deno.env.get('WHATSAPP_PHONE_ID');

/** Arabic lines stay right-aligned even when they start with an emoji or a number (RLM) */
export const rtl = (ar: boolean, s: string) => (ar ? s.split('\n').map((l) => (l ? `‏${l}` : l)).join('\n') : s);

// ─── acting as the person ─────────────────────────────────────────────────────

const sessions = new Map<string, { token: string; until: number }>();

/** A real session for this sign-in user (magic-link token made and used on the server, nothing is emailed), cached
 *  while it's fresh. Same pattern as quick-login; no secrets beyond the service role the server already has. */
export async function userToken(admin: SupabaseClient, userId: string): Promise<string> {
  const hit = sessions.get(userId);
  if (hit && hit.until > Date.now()) return hit.token;
  const { data: u, error } = await admin.auth.admin.getUserById(userId);
  const email = u?.user?.email;
  if (error || !email) throw new Error('No sign-in user for this WhatsApp number');
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) throw new Error('Could not open a session');
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, publicKey(), { auth: { persistSession: false } });
  const { data: s, error: e2 } = await anon.auth.verifyOtp({ token_hash: hash, type: 'magiclink' });
  if (e2 || !s.session) throw new Error('Could not open a session');
  sessions.set(userId, { token: s.session.access_token, until: Date.now() + Math.max(60, (s.session.expires_in ?? 3600) - 300) * 1000 });
  return s.session.access_token;
}

function publicKey() {
  const k = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!k) throw new Error('Server is missing SUPABASE_ANON_KEY');
  return k;
}

/** a database client that is this person (row-level security and current_profile_id() apply) */
export const userDb = (token: string): SupabaseClient =>
  createClient(Deno.env.get('SUPABASE_URL')!, publicKey(), { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });

/** call another edge function as this person (muntej-chat, daily-summary) */
export async function callAs<T>(token: string, fn: string, body: unknown): Promise<T> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: publicKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((out as { error?: string }).error ?? `${fn} ${res.status}`);
  return out as T;
}

// ─── what a button does (kept on the server: ids are short) ──────────────────

export async function pend(admin: SupabaseClient, profileId: string, body: Record<string, unknown>): Promise<string> {
  const key = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const { error } = await admin.from('wa_pending').insert({ key, profile_id: profileId, body });
  if (error) throw new Error(error.message);
  return key;
}

/** the action behind a tapped button, if it's this person's and not older than a day */
export async function pending(admin: SupabaseClient, profileId: string, key: string): Promise<Record<string, unknown> | null> {
  const { data } = await admin
    .from('wa_pending')
    .select('body, created_at')
    .eq('key', key)
    .eq('profile_id', profileId)
    .gte('created_at', new Date(Date.now() - 24 * 3_600_000).toISOString())
    .maybeSingle();
  return (data?.body as Record<string, unknown>) ?? null;
}
