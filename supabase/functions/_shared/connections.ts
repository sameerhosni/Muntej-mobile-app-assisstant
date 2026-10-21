// Tool connections: the provider contract, encrypted token storage and the sync of one connection into Incoming.
// Tokens never leave the server: AES-GCM with CONNECTIONS_KEY (base64, 32 bytes), stored in connection_secrets.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { requireEnv } from './http.ts';
import { ingestMessage, OPEN, type Creator } from './intake-core.ts';
import { microsoft } from './providers/microsoft.ts';

export type Tokens = { access_token: string; refresh_token?: string; expires_at?: number; scope?: string };

/** one thing worth reading from the tool (a flagged mail, a message that mentions you, a meeting's notes …) */
export type Fetched = {
  externalId: string;
  source: string;
  text: string;
  sender?: string | null;
  subject?: string | null;
  receivedAt?: string | null;
};

export type Provider = {
  id: ProviderId;
  /** the server has this tool's app credentials (client id + secret) */
  configured: () => boolean;
  authorizeUrl: (o: { state: string; redirectUri: string; challenge: string }) => string;
  exchange: (o: { code: string; redirectUri: string; verifier: string }) => Promise<Tokens>;
  refresh: (t: Tokens) => Promise<Tokens>;
  /** who signed in (shown on the Sources screen) + anything the sync needs to remember about them */
  account: (t: Tokens) => Promise<{ label: string; cursor?: Record<string, unknown> }>;
  /** what's new since `cursor` (and the cursor to use next time) */
  fetchNew: (t: Tokens, cursor: Record<string, unknown>) => Promise<{ items: Fetched[]; cursor: Record<string, unknown> }>;
};

/** every tool shown on the Sources screen; only those in PROVIDERS can connect today */
export const ALL_PROVIDERS = ['microsoft', 'google', 'slack', 'jira', 'clickup', 'trello', 'notion', 'azure_devops'] as const;
export type ProviderId = (typeof ALL_PROVIDERS)[number];
export const PROVIDERS: Partial<Record<ProviderId, Provider>> = { microsoft };

export const CALLBACK_URL = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/connect/callback`;

// ─── encryption ───────────────────────────────────────────────────────────────

let keyPromise: Promise<CryptoKey> | null = null;
function key() {
  keyPromise ??= crypto.subtle.importKey('raw', Uint8Array.from(atob(requireEnv('CONNECTIONS_KEY')), (c) => c.charCodeAt(0)), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  return keyPromise;
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));

export async function seal(tokens: Tokens): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(JSON.stringify(tokens))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64(out);
}

export async function open(data: string): Promise<Tokens> {
  const raw = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await key(), raw.slice(12));
  return JSON.parse(new TextDecoder().decode(pt)) as Tokens;
}

// ─── PKCE / state ─────────────────────────────────────────────────────────────

export function randomToken(bytes = 32) {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function challengeOf(verifier: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return b64(d).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** standard OAuth2 token call (authorization_code / refresh_token) → Tokens */
export async function tokenRequest(url: string, params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !body.access_token) {
    const msg = String(body.error_description ?? body.error ?? `token error ${res.status}`);
    throw new Error(msg.slice(0, 300));
  }
  return {
    access_token: String(body.access_token),
    refresh_token: (body.refresh_token as string) ?? params.refresh_token,
    expires_at: body.expires_in ? Date.now() + Number(body.expires_in) * 1000 : undefined,
    scope: body.scope as string | undefined,
  };
}

// ─── sync one connection ──────────────────────────────────────────────────────

type Conn = { id: string; profile_id: string; provider: ProviderId; cursor: Record<string, unknown>; found_today: number; found_day: string | null };

/** most items read per connection per run (keeps AI cost and time bounded; the rest come next run) */
const MAX_ITEMS = 15;

export async function syncConnection(admin: SupabaseClient, conn: Conn): Promise<{ read: number; tasks: number; error?: string }> {
  const provider = PROVIDERS[conn.provider];
  if (!provider) return { read: 0, tasks: 0, error: 'not available yet' };
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  try {
    const { data: secret } = await admin.from('connection_secrets').select('data').eq('connection_id', conn.id).single();
    if (!secret) throw new Error('Sign in again');
    let tokens = await open(secret.data as string);
    if (tokens.expires_at && tokens.expires_at < Date.now() + 60_000) {
      if (!tokens.refresh_token) throw new Error('Sign in again');
      tokens = await provider.refresh(tokens);
      await admin.from('connection_secrets').update({ data: await seal(tokens), updated_at: new Date().toISOString() }).eq('connection_id', conn.id);
    }

    const { items, cursor } = await provider.fetchNew(tokens, conn.cursor ?? {});
    const [{ data: team }, { data: openTasks }] = await Promise.all([
      admin.from('profiles').select('id, full_name, full_name_ar, title, skills').eq('status', 'active'),
      admin.from('tasks').select('id, title, owner_id').in('status', OPEN),
    ]);
    const create: Creator = async (p) => {
      const { data, error } = await admin.rpc('create_task_as', { p, actor: conn.profile_id });
      if (error) throw new Error(error.message);
      return data as string;
    };
    let tasks = 0;
    let read = 0;
    for (const it of items.slice(0, MAX_ITEMS)) {
      if (!it.text.trim()) continue;
      const item = await ingestMessage(admin, {
        profileId: conn.profile_id,
        text: it.text,
        source: it.source,
        externalId: it.externalId,
        sender: it.sender,
        subject: it.subject,
        receivedAt: it.receivedAt,
        team: team ?? [],
        open: openTasks ?? [],
        create,
      });
      if (!item.duplicate_message) {
        read++;
        tasks += item.suggestions.length;
      }
    }
    await admin
      .from('connections')
      .update({
        status: 'connected',
        last_error: null,
        last_sync_at: new Date().toISOString(),
        // read past what we skipped this run only if nothing was left behind
        cursor: items.length > MAX_ITEMS ? conn.cursor : cursor,
        found_day: today,
        found_today: (conn.found_day === today ? conn.found_today : 0) + tasks,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conn.id);
    return { read, tasks };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    console.error('sync failed', conn.provider, msg);
    await admin
      .from('connections')
      .update({ status: 'error', last_error: msg, last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', conn.id);
    return { read: 0, tasks: 0, error: msg };
  }
}
