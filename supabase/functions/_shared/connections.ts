// Tool connections: the provider contract, encrypted token storage and the sync of one connection into Incoming.
// Tokens never leave the server: AES-GCM with CONNECTIONS_KEY (base64, 32 bytes), stored in connection_secrets.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { requireEnv } from './http.ts';
import { aiAllowed } from './ai-consent.ts';
import { sendPush } from './push.ts';
import { ingestMessage, OPEN, type Creator } from './intake-core.ts';
import { microsoft } from './providers/microsoft.ts';
import { google, findEmailByName } from './providers/google.ts';
import { clickup } from './providers/clickup.ts';
import { jira } from './providers/jira.ts';
import { trello } from './providers/trello.ts';

/** `extra` holds what a personal-token connection needs besides the token (Jira site + email, Trello API key …) */
export type Tokens = { access_token: string; refresh_token?: string; expires_at?: number; scope?: string; extra?: Record<string, string> };

/** one thing worth reading from the tool (a flagged mail, a message that mentions you, a meeting's notes …) */
export type Fetched = {
  externalId: string;
  source: string;
  text: string;
  sender?: string | null;
  subject?: string | null;
  receivedAt?: string | null;
  /** the conversation it belongs to, by the tool's own id (Gmail thread, Chat space): "already answered" looks here */
  conversation?: string | null;
  /** already a task in the tool (assigned to the person): taken as-is, no AI reading */
  task?: { title: string; due_at: string | null; priority: 'low' | 'medium' | 'high' | 'urgent'; description?: string | null; link?: string | null };
};

export type Provider = {
  id: ProviderId;
  /** what it finds always waits for the person's OK in Incoming (never added by itself, even when sure) */
  confirmFirst?: boolean;
  /** the server has this tool's app credentials (client id + secret) */
  configured: () => boolean;
  authorizeUrl: (o: { state: string; redirectUri: string; challenge: string }) => string;
  exchange: (o: { code: string; redirectUri: string; verifier: string }) => Promise<Tokens>;
  refresh: (t: Tokens) => Promise<Tokens>;
  /** who signed in (shown on the Sources screen) + anything the sync needs to remember about them */
  account: (t: Tokens) => Promise<{ label: string; cursor?: Record<string, unknown> }>;
  /** what's new since `cursor` (and the cursor to use next time); `features` = the account's switches (Gmail / Calendar / Meet…) */
  fetchNew: (
    t: Tokens,
    cursor: Record<string, unknown>,
    features?: Record<string, boolean>,
  ) => Promise<{ items: Fetched[]; cursor: Record<string, unknown> }>;
  /**
   * the person can connect with their own personal API token instead of signing in (no admin app setup needed);
   * `verify` checks it and says who it belongs to
   */
  personalToken?: {
    /** what the person fills in, in order (always includes 'token') */
    fields: string[];
    verify: (creds: Record<string, string>) => Promise<{ label: string; cursor?: Record<string, unknown> }>;
  };
  /** two-way task tools (Muntej → tool, and keeping both sides in step); mail / chat tools leave this out */
  tasks?: TaskSync;
};

export type OutTask = { title: string; due_at: string | null; priority: 'low' | 'medium' | 'high' | 'urgent'; description: string | null };
export type TaskSync = {
  /** where Muntej may put tasks: lists / projects in the person's account */
  targets: (t: Tokens, cursor: Record<string, unknown>) => Promise<{ id: string; name: string }[]>;
  create: (t: Tokens, cursor: Record<string, unknown>, targetId: string, task: OutTask) => Promise<{ id: string; url: string | null }>;
  update: (t: Tokens, cursor: Record<string, unknown>, externalId: string, task: Pick<OutTask, 'title' | 'due_at'>) => Promise<void>;
  close: (t: Tokens, cursor: Record<string, unknown>, externalId: string) => Promise<void>;
  /** which of these items are finished / closed in the tool */
  closedAmong: (t: Tokens, cursor: Record<string, unknown>, externalIds: string[]) => Promise<Set<string>>;
};

/** every tool shown on the Sources screen; only those in PROVIDERS can connect today */
/** someone's email from this person's connected Google mailbox, or null (no mailbox, nothing found, or it failed) */
export async function emailFromMailbox(admin: SupabaseClient, profileId: string, name: string, myEmail?: string | null): Promise<string | null> {
  const { data: conns } = await admin.from('connections').select('id').eq('profile_id', profileId).eq('provider', 'google');
  for (const conn of conns ?? []) {
    try {
      const { data: secret } = await admin.from('connection_secrets').select('data').eq('connection_id', conn.id).single();
      if (!secret) continue;
      let tokens = await open(secret.data as string);
      if (tokens.expires_at && tokens.expires_at < Date.now() + 60_000) {
        if (!tokens.refresh_token) continue;
        tokens = await google.refresh(tokens);
        await admin.from('connection_secrets').update({ data: await seal(tokens), updated_at: new Date().toISOString() }).eq('connection_id', conn.id);
      }
      const found = await findEmailByName(tokens, name, myEmail);
      if (found) return found;
    } catch (e) {
      console.warn('email lookup', (e as Error).message);
    }
  }
  return null;
}

export const ALL_PROVIDERS = ['microsoft', 'google', 'slack', 'jira', 'clickup', 'trello', 'notion', 'azure_devops'] as const;
export type ProviderId = (typeof ALL_PROVIDERS)[number];
export const PROVIDERS: Partial<Record<ProviderId, Provider>> = { microsoft, google, clickup, jira, trello };

export const CALLBACK_URL = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/connect/callback`;

// ─── encryption ───────────────────────────────────────────────────────────────

let keyPromise: Promise<CryptoKey> | null = null;
function key() {
  keyPromise ??= crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(requireEnv('CONNECTIONS_KEY')), (c) => c.charCodeAt(0)),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
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
  return b64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
export async function challengeOf(verifier: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return b64(d).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** standard OAuth2 token call (authorization_code / refresh_token) → Tokens */
export async function tokenRequest(url: string, params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
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

// ─── sync one connection (both ways) ──────────────────────────────────────────

type Conn = {
  id: string;
  profile_id: string;
  provider: ProviderId;
  cursor: Record<string, unknown>;
  found_today: number;
  found_day: string | null;
  import_on?: boolean;
  export_on?: boolean;
  export_target?: { id: string; name: string; since?: string } | null;
  features?: Record<string, boolean>;
  status?: string;
  last_error?: string | null;
};
export type SyncResult = { read: number; tasks: number; sent: number; closedHere: number; closedThere: number; updated: number; error?: string; more?: boolean };

export const TOOL_NAME: Record<ProviderId, { en: string; ar: string }> = {
  microsoft: { en: 'Microsoft 365', ar: 'مايكروسوفت ٣٦٥' },
  google: { en: 'Google', ar: 'قوقل' },
  slack: { en: 'Slack', ar: 'سلاك' },
  jira: { en: 'Jira', ar: 'جيرا' },
  clickup: { en: 'ClickUp', ar: 'كليك أب' },
  trello: { en: 'Trello', ar: 'تريلو' },
  notion: { en: 'Notion', ar: 'نوشن' },
  azure_devops: { en: 'Azure DevOps', ar: 'أزور ديف أوبس' },
};

/** most items read per connection per run (keeps AI cost and time bounded; the rest come next run) */
const MAX_ITEMS = 15;
/** most tasks sent / closed / updated in the tool per run */
const MAX_WRITES = 10;
const FINISHED = ['done', 'cancelled'];
const OPEN_FOR_EXPORT = ['draft', 'assigned', 'in_progress', 'blocked', 'returned'];

type LinkRow = {
  id: string;
  task_id: string;
  external_id: string;
  direction: 'in' | 'out';
  closed_there: boolean;
  synced_at: string;
  task: { id: string; title: string; due_at: string | null; status: string; updated_at: string } | null;
};

/** two due dates are the same day (tools keep dates, Muntej keeps times) */
const sameDue = (a: string | null | undefined, b: string | null | undefined) =>
  (!a && !b) ||
  (!!a &&
    !!b &&
    new Date(Date.parse(a) + 3 * 3_600_000).toISOString().slice(0, 10) === new Date(Date.parse(b) + 3 * 3_600_000).toISOString().slice(0, 10));

/** tools whose items arrive as tasks already (no AI reading) */
const TASK_TOOLS = ['clickup', 'jira', 'trello'];

// ─── a read the app can follow (owner, 12 Nov: "How can I know it is finished") ──────────────────────────────
// The read writes where it is to connections.reading: one line per source (option 1: Gmail ✓ · Chat ✓ · Meet …),
// then done / failed with a short code the app turns into one plain sentence (never the raw error, R7).

export type ReadSource = { key: string; total: number; read: number; added: number; done: boolean };
export type ReadErrorCode = 'signin' | 'ai_off' | 'tool_down' | 'other';
type Progress = (p: { sources: ReadSource[]; read: number; tasks: number }) => Promise<void>;

/** the parts a connection reads, so a part with nothing new still shows «✓» */
export function sourcesOf(conn: Pick<Conn, 'provider' | 'features'>): string[] {
  const on = (k: string) => (conn.features ?? {})[k] !== false;
  if (conn.provider === 'google')
    return [on('gmail') && 'gmail', on('chat') && 'google_chat', on('meet') && 'meet', on('calendar') && 'calendar'].filter(Boolean) as string[];
  if (conn.provider === 'microsoft') return ['outlook', 'teams', 'calendar'];
  return [conn.provider];
}

export function readErrorCode(msg: string): ReadErrorCode {
  if (/AI is off/i.test(msg)) return 'ai_off';
  if (/expired|revoked|invalid_grant|sign in again|unauthori[sz]ed|\b401\b|\b403\b/i.test(msg)) return 'signin';
  if (/\b5\d\d\b|timed? ?out|fetch failed|ECONN|unavailable|socket/i.test(msg)) return 'tool_down';
  return 'other';
}

/**
 * Read one connection so the app can follow it. Only one read at a time per connection: if one is running (your tap,
 * the 10-min job), this one joins it and returns null.
 */
export async function readConnection(admin: SupabaseClient, conn: Conn, by: 'you' | 'auto'): Promise<SyncResult | null> {
  if (!(await claimRead(admin, conn.id, by))) return null;
  return await runRead(admin, conn, by);
}

/** true = this caller owns the read now; false = one is already running (join it) */
export async function claimRead(admin: SupabaseClient, connId: string, by: 'you' | 'auto'): Promise<boolean> {
  const { data, error } = await admin.rpc('claim_read', { p_conn: connId, p_by: by });
  if (error) throw new Error(error.message);
  return data === true;
}

/** the read itself, after claimRead said yes */
export async function runRead(admin: SupabaseClient, conn: Conn, by: 'you' | 'auto'): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  const base = { by, started_at: startedAt };
  let last: { sources: ReadSource[]; read: number; tasks: number } = { sources: sourcesOf(conn).map((key) => ({ key, total: 0, read: 0, added: 0, done: false })), read: 0, tasks: 0 };
  const write = (reading: Record<string, unknown>) => admin.from('connections').update({ reading }).eq('id', conn.id);
  await write({ ...base, state: 'reading', ...last });
  const r = await syncConnection(admin, conn, async (p) => {
    last = p;
    await write({ ...base, state: 'reading', ...p });
  }).catch((e) => ({ read: 0, tasks: 0, sent: 0, closedHere: 0, closedThere: 0, updated: 0, error: (e as Error).message }) as SyncResult);
  const finished = new Date().toISOString();
  await write(
    r.error
      ? { ...base, state: 'failed', finished_at: finished, ...last, read: r.read, tasks: r.tasks, error_code: readErrorCode(r.error), error: r.error.slice(0, 200) }
      : { ...base, state: 'done', finished_at: finished, sources: last.sources.map((s) => ({ ...s, done: true })), read: r.read, tasks: r.tasks, more: r.more === true },
  );
  return r;
}

/** stop taking new items after this long, so a read always ends before the function's ~400 s limit (R150); the rest
 *  come next read (they aren't marked read) */
const TIME_BUDGET_MS = 300_000;

export async function syncConnection(admin: SupabaseClient, conn: Conn, progress?: Progress): Promise<SyncResult> {
  const out: SyncResult = { read: 0, tasks: 0, sent: 0, closedHere: 0, closedThere: 0, updated: 0 };
  const began = Date.now();
  const provider = PROVIDERS[conn.provider];
  if (!provider) return { ...out, error: 'not available yet' };
  // mail, chats and meetings are read by the AI: wait (cursor untouched) until the owner allows it; task tools aren't
  if (!TASK_TOOLS.includes(conn.provider) && !(await aiAllowed(conn.profile_id, admin)))
    return { ...out, error: 'AI is off: allow it in Settings so Muntej can read this tool' };
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const nowIso = () => new Date().toISOString();
  const name = TOOL_NAME[conn.provider];
  try {
    const { data: secret } = await admin.from('connection_secrets').select('data').eq('connection_id', conn.id).single();
    if (!secret) throw new Error('Sign in again');
    let tokens = await open(secret.data as string);
    if (tokens.expires_at && tokens.expires_at < Date.now() + 60_000) {
      if (!tokens.refresh_token) throw new Error('Sign in again');
      tokens = await provider.refresh(tokens);
      await admin
        .from('connection_secrets')
        .update({ data: await seal(tokens), updated_at: nowIso() })
        .eq('connection_id', conn.id);
    }
    const cur = conn.cursor ?? {};
    let nextCursor = cur;
    const { data: linkRows } = await admin
      .from('task_links')
      .select('id, task_id, external_id, direction, closed_there, synced_at, task:tasks(id, title, due_at, status, updated_at)')
      .eq('connection_id', conn.id);
    const links = (linkRows ?? []) as unknown as LinkRow[];
    const linkByExt = new Map(links.map((l) => [l.external_id, l]));

    // ── 1. in: tool → Muntej ──
    if (conn.import_on !== false) {
      // meetings you only attended: testers first, decided here for the connection's owner (R69)
      const attended = (await admin.rpc('feature_on_for', { p_key: 'meet_attended', p_profile: conn.profile_id })).data === true;
      const { items, cursor } = await provider.fetchNew(tokens, cur, { ...((conn.features ?? {}) as Record<string, boolean>), meet_attended: attended });
      // items already linked: their title / due date changes come over
      for (const it of items) {
        const l = linkByExt.get(it.externalId);
        if (!l?.task || !it.task || FINISHED.includes(l.task.status)) continue;
        const patch: Record<string, unknown> = {};
        if (it.task.title && it.task.title !== l.task.title) patch.title = it.task.title;
        if (!sameDue(it.task.due_at, l.task.due_at)) patch.due_at = it.task.due_at;
        if (!Object.keys(patch).length) continue;
        await admin.from('tasks').update(patch).eq('id', l.task_id);
        await admin.from('task_links').update({ synced_at: nowIso() }).eq('id', l.id);
        out.updated++;
      }
      // only the person's own company: its team (who a task can go to) and its open tasks (duplicates)
      const { data: owner } = await admin.from('profiles').select('account_id').eq('id', conn.profile_id).single();
      const { data: team } = await admin
        .from('profiles')
        .select('id, full_name, full_name_ar, title, skills')
        // invited but not signed in yet (pending) still get their work (owner, 9 Nov: Badawy's tasks came with no owner)
        .neq('status', 'deleted')
        .eq('hidden', false)
        .eq('account_id', owner?.account_id);
      const teamIds = (team ?? []).map((p) => p.id as string);
      const { data: openTasks } = teamIds.length
        ? await admin.from('tasks').select('id, title, owner_id').in('status', OPEN).in('owner_id', teamIds)
        : { data: [] };
      const create: Creator = async (p) => {
        const { data, error } = await admin.rpc('create_task_as', { p, actor: conn.profile_id });
        if (error) throw new Error(error.message);
        return data as string;
      };
      // only what Muntej hasn't read yet counts towards this run's cap (so a long list never gets stuck on old items)
      const ids = items.map((i) => i.externalId);
      const { data: seen } = ids.length
        ? await admin.from('incoming_items').select('external_id').eq('owner_id', conn.profile_id).in('external_id', ids)
        : { data: [] as { external_id: string }[] };
      const seenIds = new Set((seen ?? []).map((r) => r.external_id as string));
      const fresh = items.filter((i) => !seenIds.has(i.externalId) && !linkByExt.has(i.externalId) && (i.task || i.text.trim()));
      // mail / chat tasks waiting for the person's OK from this check: one push at the end (Nouran, 10 Nov: "we need to
      // improve the discovery for it as I discovered it by chance")
      let waitingNew = 0;
      // and which ones: the alert names them (owner, 10 Nov: «لقيت مهمة وحدة لك» said nothing, so «ايه هي؟»)
      const waitingTitles: string[] = [];
      // the items themselves, kept on the alert: its cards and «ايه هي؟» show exactly these (reviewer, 10 Nov)
      const waitingItems: string[] = [];
      // one source after another, so the page ticks Gmail ✓, then Chat ✓, then Meet ✓ (option 1, owner 12 Nov)
      const keys = sourcesOf(conn);
      const keyOf = (s: string) => (keys.includes(s) ? s : (keys[0] ?? s));
      const batch = fresh.slice(0, MAX_ITEMS).sort((a, b) => keys.indexOf(keyOf(a.source)) - keys.indexOf(keyOf(b.source)));
      const sources: ReadSource[] = keys.map((key) => ({ key, total: 0, read: 0, added: 0, done: false }));
      for (const it of batch) {
        const s = sources.find((x) => x.key === keyOf(it.source));
        if (s) s.total++;
      }
      const tell = async () => {
        for (const s of sources) s.done = s.read >= s.total;
        await progress?.({ sources: sources.map((s) => ({ ...s })), read: out.read, tasks: out.tasks }).catch(() => {});
      };
      // the fetch is done: parts with nothing new tick at once
      await tell();
      let cut = false;
      for (const it of batch) {
        if (Date.now() - began > TIME_BUDGET_MS) {
          cut = true;
          break;
        }
        const src = sources.find((x) => x.key === keyOf(it.source));
        const item = await ingestMessage(admin, {
          profileId: conn.profile_id,
          text: it.text,
          source: it.source,
          externalId: it.externalId,
          sender: it.sender,
          subject: it.subject,
          receivedAt: it.receivedAt,
          conversation: it.conversation ?? null,
          team: team ?? [],
          open: openTasks ?? [],
          create,
          structured: it.task,
          confirmFirst: provider.confirmFirst,
          connectionId: conn.id,
        });
        if (src) src.read++;
        if (item.duplicate_message) {
          await tell();
          continue;
        }
        out.read++;
        // the line's own count adds up to the done line's total (reviewer, 12 Nov: duplicates counted on the line only)
        if (src) src.added++;
        await tell();
        // a meeting that brought tasks: one push, so the organiser knows right after it ends (owner: "go with transcript")
        if ((it.source === 'meet' || it.source === 'meeting') && item.suggestions.length) {
          const { data: who } = await admin.from('profiles').select('locale').eq('id', conn.profile_id).maybeSingle();
          const ar = who?.locale === 'ar';
          const n = item.suggestions.length;
          const name = it.subject ?? (ar ? 'اجتماعك' : 'your meeting');
          await sendPush(
            [conn.profile_id],
            {
              title: `🎙 ${name}`,
              body: ar
                ? `قريت المحضر ولقيت ${n === 1 ? 'مهمة' : n === 2 ? 'مهمتين' : `${n} مهام`}، بمسؤولها وموعدها. تنتظر موافقتك 👍`
                : `I read the transcript and found ${n} task${n > 1 ? 's' : ''} with owners and dates. They wait for your OK 👍`,
              data: { screen: '/42-incoming' },
            },
            admin,
          ).catch(() => 0);
        }
        if (!it.task && it.source !== 'meet' && it.source !== 'meeting') {
          const fresh = item.suggestions.filter((s) => s.state === 'new');
          waitingNew += fresh.length;
          waitingTitles.push(...fresh.map((s) => s.title));
          if (fresh.length) waitingItems.push(item.id);
        }
        // tool tasks count when they became Muntej tasks; mail / chat counts every task found (some wait in Incoming)
        out.tasks += it.task ? item.suggestions.filter((s) => s.state === 'accepted').length : item.suggestions.length;
        // a tool task that became a Muntej task is linked, so status and changes stay in step from now on
        const made = it.task ? item.suggestions.find((s) => s.task_id) : undefined;
        if (made?.task_id) {
          await admin.from('task_links').upsert(
            {
              task_id: made.task_id,
              connection_id: conn.id,
              provider: conn.provider,
              external_id: it.externalId,
              external_url: it.task?.link ?? null,
              direction: 'in',
            },
            { onConflict: 'connection_id,external_id', ignoreDuplicates: true },
          );
        }
      }
      if (cut) out.more = true;
      else for (const s of sources) s.done = true;
      await tell();
      nextCursor = fresh.length > MAX_ITEMS || cut ? cur : cursor;
      // an everyday alert (not a direct push): quiet hours, Friday and the daily budget apply, it shows on the Alerts
      // screen, and a tap opens "From your tools" (reviewer, 10 Nov). One per connection per check.
      if (waitingNew > 0) {
        const n = waitingNew;
        const named = waitingTitles.slice(0, 2).map((t) => `«${t.length > 60 ? `${t.slice(0, 59)}…` : t}»`);
        const more = n - named.length;
        await admin.from('alerts').insert({
          profile_id: conn.profile_id,
          kind: 'tools_found',
          title: n === 1 ? `🔌 From your tools: ${named[0]}` : `🔌 ${n} tasks from your tools`,
          body: `${named.join(' · ')}${more > 0 ? ` +${more} more` : ''}. They wait for your OK.`,
          title_ar: n === 1 ? `🔌 من أدواتك: ${named[0]}` : `🔌 ${n === 2 ? 'مهمتين' : `${n} ${n <= 10 ? 'مهام' : 'مهمة'}`} من أدواتك`,
          body_ar: `${named.join(' · ')}${more > 0 ? ` و${more} غيرها` : ''}. تنتظر موافقتك.`,
          dedupe_key: `tools_found:${conn.id}:${Date.now()}:${waitingItems.slice(0, 20).join(',')}`,
        });
      }
    }

    // ── 2. out: Muntej → tool (the person's own open tasks from when they switched it on) ──
    const target = conn.export_target;
    if (provider.tasks && conn.export_on && target?.id) {
      const { data: mine } = await admin
        .from('tasks')
        .select('id, title, due_at, priority, description, created_at')
        .eq('owner_id', conn.profile_id)
        .in('status', OPEN_FOR_EXPORT)
        .gte('created_at', target.since ?? nowIso())
        .order('created_at')
        .limit(50);
      const mineIds = (mine ?? []).map((t) => t.id);
      const { data: linked } = mineIds.length ? await admin.from('task_links').select('task_id').in('task_id', mineIds) : { data: [] };
      const linkedIds = new Set((linked ?? []).map((r) => r.task_id as string));
      for (const t of (mine ?? []).filter((x) => !linkedIds.has(x.id)).slice(0, MAX_WRITES)) {
        const made = await provider.tasks.create(tokens, cur, target.id, {
          title: t.title,
          due_at: t.due_at,
          priority: t.priority,
          description: t.description,
        });
        await admin
          .from('task_links')
          .insert({ task_id: t.id, connection_id: conn.id, provider: conn.provider, external_id: made.id, external_url: made.url, direction: 'out' });
        await admin.from('activity_log').insert({
          actor_type: 'muntej',
          subject_id: conn.profile_id,
          task_id: t.id,
          action: 'sent_to_tool',
          summary: `Sent "${t.title}" to ${name.en} (${target.name})`,
          summary_ar: `أرسل «${t.title}» إلى ${name.ar} (${target.name})`,
          undoable: false,
        });
        out.sent++;
      }
    }

    // ── 3. keep linked tasks in step (status both ways, Muntej's title / due changes go to the tool) ──
    if (provider.tasks && links.length) {
      const openHere = links.filter((l) => l.task && !FINISHED.includes(l.task.status) && !l.closed_there);
      const closed = openHere.length
        ? await provider.tasks.closedAmong(
            tokens,
            cur,
            openHere.slice(0, 40).map((l) => l.external_id),
          )
        : new Set<string>();
      for (const l of openHere) {
        if (!closed.has(l.external_id)) continue;
        await admin
          .from('tasks')
          .update({ status: 'done', closed_at: nowIso(), progress: 100 })
          .eq('id', l.task_id)
          .not('status', 'in', '(done,cancelled)');
        await admin.from('task_links').update({ closed_there: true, synced_at: nowIso() }).eq('id', l.id);
        await admin.from('activity_log').insert({
          actor_type: 'muntej',
          subject_id: conn.profile_id,
          task_id: l.task_id,
          action: 'task_closed',
          summary: `Closed "${l.task!.title}" because it was finished in ${name.en}`,
          summary_ar: `قفل «${l.task!.title}» لأنها خلصت في ${name.ar}`,
          undoable: false,
        });
        out.closedHere++;
      }
      for (const l of links.filter((x) => x.task?.status === 'done' && !x.closed_there).slice(0, MAX_WRITES)) {
        await provider.tasks.close(tokens, cur, l.external_id);
        await admin.from('task_links').update({ closed_there: true, synced_at: nowIso() }).eq('id', l.id);
        out.closedThere++;
      }
      const changed = links.filter(
        (l) => l.task && !FINISHED.includes(l.task.status) && !closed.has(l.external_id) && l.task.updated_at > l.synced_at,
      );
      for (const l of changed.slice(0, MAX_WRITES)) {
        await provider.tasks.update(tokens, cur, l.external_id, { title: l.task!.title, due_at: l.task!.due_at });
        await admin.from('task_links').update({ synced_at: nowIso() }).eq('id', l.id);
      }
    }

    // ── 4. one grouped notification for what moved ──
    const parts = { en: [] as string[], ar: [] as string[] };
    if (out.tasks) {
      parts.en.push(`${out.tasks} task${out.tasks === 1 ? '' : 's'} came in`);
      const n = out.tasks;
      parts.ar.push(n === 1 ? 'وصلت مهمة' : n === 2 ? 'وصلت مهمتين' : n <= 10 ? `وصلت ${n} مهام` : `وصلت ${n} مهمة`);
    }
    if (out.sent) {
      parts.en.push(`${out.sent} sent`);
      parts.ar.push(`انرسلت ${out.sent}`);
    }
    if (out.closedHere + out.closedThere) {
      parts.en.push(`${out.closedHere + out.closedThere} closed on both sides`);
      parts.ar.push(`انقفلت ${out.closedHere + out.closedThere} بالطرفين`);
    }
    if (parts.en.length) {
      await admin.from('alerts').insert({
        profile_id: conn.profile_id,
        kind: 'tool_sync',
        subject_id: conn.profile_id,
        title: `${name.en}: ${parts.en.join(' · ')}`,
        body: 'Muntej keeps both sides in step.',
        title_ar: `${name.ar}: ${parts.ar.join(' · ')}`,
        body_ar: 'منتج يخلّي الطرفين متطابقين.',
        dedupe_key: `sync:${conn.id}:${nowIso()}`,
      });
    }

    await tellHealth(admin, conn, problemOf(conn.status ?? 'connected', conn.last_error ?? null, conn.cursor, conn.features), problemOf('connected', null, nextCursor, conn.features), out.read);
    await admin
      .from('connections')
      .update({
        status: 'connected',
        last_error: null,
        last_sync_at: nowIso(),
        cursor: nextCursor,
        found_day: today,
        found_today: (conn.found_day === today ? conn.found_today : 0) + out.tasks,
        updated_at: nowIso(),
      })
      .eq('id', conn.id);
    return out;
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    console.error('sync failed', conn.provider, msg);
    await tellHealth(admin, conn, problemOf(conn.status ?? 'connected', conn.last_error ?? null, conn.cursor, conn.features), msg, 0);
    await admin.from('connections').update({ status: 'error', last_error: msg, last_sync_at: nowIso(), updated_at: nowIso() }).eq('id', conn.id);
    return { ...out, error: msg };
  }
}

// ─── Saree3 keeps you posted (owner: "this is the behaviour I need Muntej to have with users") ───────────────────
// A tool that breaks is retried by itself on every run; you hear about it once, only when it needs YOU (sign in
// again). When it works again you hear that too, with what it read. "Google not ready" and similar stay quiet.

/** what's wrong with a connection right now, or null (a part's error counts only while that part is switched on) */
export function problemOf(status: string, lastError: string | null, cursor: unknown, features: unknown): string | null {
  if (status === 'error' && lastError) return lastError;
  const c = (cursor ?? {}) as Record<string, unknown>;
  const f = (features ?? {}) as Record<string, boolean>;
  if (f.meet !== false && typeof c.meet_error === 'string' && c.meet_error) return c.meet_error;
  if (f.chat !== false && typeof c.chat_error === 'string' && c.chat_error) return c.chat_error;
  return null;
}

/** sign-in problems are the person's to fix; everything else Saree3 retries without bothering them */
export const needsPerson = (problem: string) => /sign in again|401|invalid_grant|revoked|expired/i.test(problem);

async function tellHealth(admin: SupabaseClient, conn: Conn, before: string | null, after: string | null, read: number) {
  const fixed = !!before && !after;
  const broke = !before && !!after && needsPerson(after);
  if (!fixed && !broke) return;
  const { data: who } = await admin.from('profiles').select('locale').eq('id', conn.profile_id).maybeSingle();
  const ar = who?.locale === 'ar';
  const tool = TOOL_NAME[conn.provider]?.[ar ? 'ar' : 'en'] ?? conn.provider;
  await sendPush(
    [conn.profile_id],
    fixed
      ? {
          title: ar ? `✅ ${tool} رجع يشتغل` : `✅ ${tool} works again`,
          body: ar
            ? `حاولت لين ضبطت${read ? `، وقريت ${read} جديدة` : ''}. ما تحتاج تسوي شي 👍`
            : `I kept trying until it worked${read ? `, and read ${read} new` : ''}. Nothing for you to do 👍`,
          data: { screen: '/42-incoming' },
        }
      : {
          title: ar ? `🙋 ${tool} يحتاجك` : `🙋 ${tool} needs you`,
          body: ar
            ? 'انتهى دخولك فيه. افتح «أدواتك» واضغط «اربط من جديد»، والباقي علي.'
            : 'Your sign-in ended. Open "Your tools" and tap "Reconnect"; I’ll do the rest.',
          data: { screen: '/12-sources' },
        },
    admin,
  ).catch(() => 0);
}
