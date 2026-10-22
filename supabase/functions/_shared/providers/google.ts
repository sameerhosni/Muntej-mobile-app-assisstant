// Google Workspace / Gmail (Gmail + Google Calendar), signed in as the person.
// Google Cloud → APIs & Services: enable Gmail API + Google Calendar API; OAuth consent screen (External; while in
// "Testing", add each person as a test user); Credentials → OAuth client ID (Web application) with the redirect URI
// <SUPABASE_URL>/functions/v1/connect/callback. Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (scripts/set-google.ps1).
// Scopes: gmail.readonly, calendar.readonly (read only: Muntej never sends, deletes or changes mail or events).
//
// What Muntej reads (only what's new since the last check, never the whole mailbox):
//   Gmail     every new mail in the inbox (not promotions / social, not Muntej's own sign-in code mails); the first
//             check reads the last 7 days
//   Calendar  meetings that just ended and have notes / an agenda in the invite
// Everything found WAITS for the person's OK in "Add from a message" (owner's decision: Gmail tasks are confirmed,
// never added by themselves): see confirmFirst.
import { tokenRequest, type Fetched, type Provider, type Tokens } from '../connections.ts';

const SCOPES = 'openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly';
const FIRST_LOOK_BACK_MS = 7 * 24 * 3_600_000; // the first check reads the last week, not years of history
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
// work mail often lands in Updates / Forums (tool notifications), and people email themselves tasks: both are read
const INBOX_QUERY = 'in:inbox -category:promotions -category:social -subject:"Muntej code"';

async function api<T>(t: Tokens, url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t.access_token}` } });
  if (res.status === 401) throw new Error('Sign in again');
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Gmail bodies are base64url, usually UTF-8 */
function fromB64url(data: string) {
  const b64 = data
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(data.length / 4) * 4, '=');
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** HTML (mail, invites) → plain text */
const plain = (html: string) =>
  html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
type GMessage = { id: string; internalDate?: string; payload?: Part & { headers?: { name: string; value: string }[] } };
type GEvent = {
  id: string;
  summary?: string;
  description?: string;
  status?: string;
  organizer?: { displayName?: string; email?: string };
  end?: { dateTime?: string; date?: string };
};

/** the mail's text: text/plain when there is one, else the HTML made plain */
function bodyOf(p: Part | undefined): string {
  if (!p) return '';
  const find = (x: Part, type: string): string | null => {
    if (x.mimeType === type && x.body?.data) return fromB64url(x.body.data);
    for (const c of x.parts ?? []) {
      const got = find(c, type);
      if (got) return got;
    }
    return null;
  };
  const text = find(p, 'text/plain');
  if (text) return text.trim();
  const html = find(p, 'text/html');
  return html ? plain(html) : '';
}

/** a reply's quoted history is old news: keep what this mail says */
const withoutQuoted = (s: string) => s.split(/\n(?:On .{5,120}wrote:|في .{5,120}كتب:|-{2,} ?Original Message|From: .+\nSent: )/)[0].trim();

export const google: Provider = {
  id: 'google',
  confirmFirst: true,
  configured: () => !!Deno.env.get('GOOGLE_CLIENT_ID') && !!Deno.env.get('GOOGLE_CLIENT_SECRET'),

  authorizeUrl: ({ state, redirectUri, challenge }) =>
    `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      // offline + consent: Google only gives a refresh token (for the 10-minute checks) this way
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: 'true',
    })}`,

  exchange: ({ code, redirectUri, verifier }) =>
    tokenRequest('https://oauth2.googleapis.com/token', {
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),

  refresh: (t) =>
    tokenRequest('https://oauth2.googleapis.com/token', {
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token ?? '',
    }),

  account: async (t) => {
    const me = await api<{ email?: string; name?: string }>(t, 'https://openidconnect.googleapis.com/v1/userinfo');
    return { label: me.email ?? me.name ?? 'Google' };
  },

  fetchNew: async (t, cursor) => {
    const now = new Date();
    const since = typeof cursor.since === 'string' ? cursor.since : new Date(now.getTime() - FIRST_LOOK_BACK_MS).toISOString();
    const items: Fetched[] = [];

    // Gmail: every new inbox mail since the last check (Gmail's "after:" is in whole seconds)
    try {
      const q = `${INBOX_QUERY} after:${Math.floor(Date.parse(since) / 1000)}`;
      const list = await api<{ messages?: { id: string }[] }>(t, `${GMAIL}/messages?${new URLSearchParams({ q, maxResults: '20' })}`);
      for (const { id } of list.messages ?? []) {
        const m = await api<GMessage>(t, `${GMAIL}/messages/${id}?format=full`);
        const h = (name: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === name)?.value ?? '';
        const from = h('from');
        const subject = h('subject');
        const body = withoutQuoted(bodyOf(m.payload));
        if (!body && !subject) continue;
        items.push({
          externalId: m.id,
          source: 'gmail',
          text: [`Subject: ${subject}`, `From: ${from}`, '', body].join('\n').slice(0, 8000),
          sender: from.replace(/\s*<[^>]+>\s*$/, '').replace(/"/g, '') || from,
          subject: subject || null,
          receivedAt: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null,
        });
      }
    } catch (e) {
      if ((e as Error).message === 'Sign in again') throw e;
      console.warn('gmail', (e as Error).message);
    }

    // Calendar: meetings that ended since the last check and carry notes / an agenda
    try {
      const events = await api<{ items?: GEvent[] }>(
        t,
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
          timeMin: new Date(Date.parse(since) - 8 * 3_600_000).toISOString(),
          timeMax: now.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '25',
        })}`,
      );
      for (const ev of events.items ?? []) {
        if (ev.status === 'cancelled') continue;
        const end = Date.parse(ev.end?.dateTime ?? ev.end?.date ?? '');
        if (Number.isNaN(end) || end < Date.parse(since) || end > now.getTime()) continue;
        const notes = plain(ev.description ?? '');
        if (notes.length < 80) continue; // an empty invite has nothing to act on
        items.push({
          externalId: `cal:${ev.id}`,
          source: 'calendar',
          text: `Meeting: ${ev.summary ?? ''}\nOrganizer: ${ev.organizer?.displayName ?? ev.organizer?.email ?? ''}\n\n${notes}`.slice(0, 8000),
          sender: ev.organizer?.displayName ?? ev.organizer?.email ?? null,
          subject: ev.summary ?? null,
          receivedAt: new Date(end).toISOString(),
        });
      }
    } catch (e) {
      if ((e as Error).message === 'Sign in again') throw e;
      console.warn('google calendar', (e as Error).message);
    }

    // a little overlap: the same message is never read twice (external id), so nothing slips between runs
    return { items, cursor: { ...cursor, since: new Date(now.getTime() - 2 * 60_000).toISOString() } };
  },
};
