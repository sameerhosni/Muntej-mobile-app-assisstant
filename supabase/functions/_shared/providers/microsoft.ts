// Microsoft 365 (Outlook mail, Teams chats, Outlook Calendar) through Microsoft Graph, signed in as the person.
// App registration (Azure → Entra ID → App registrations): env MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT
// (your tenant id, or "organizations" for any work account). Redirect URI: <SUPABASE_URL>/functions/v1/connect/callback.
// Delegated permissions: offline_access, User.Read, Mail.Read, Chat.Read, Calendars.Read.
//
// What Muntej reads (only what's new since the last check, never the whole mailbox):
//   Outlook   flagged mail, and mail in a folder named "Muntej" (drag a mail there to hand it over)
//   Teams     chat messages that @mention you
//   Calendar  meetings that just ended and have notes / an agenda in the invite
import { tokenRequest, type Fetched, type Provider, type Tokens } from '../connections.ts';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'offline_access openid profile email User.Read Mail.Read Chat.Read Calendars.Read';
const FIRST_LOOK_BACK_MS = 24 * 3_600_000; // the first check reads the last day, not years of history
const tenant = () => Deno.env.get('MS_TENANT') ?? 'organizations';
const authBase = () => `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0`;

async function graph<T>(t: Tokens, path: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, { headers: { Authorization: `Bearer ${t.access_token}`, ...headers } });
  if (res.status === 401) throw new Error('Sign in again');
  if (!res.ok) throw new Error(`Microsoft ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** HTML (Teams messages, invites) → plain text */
const plain = (html: string) =>
  html
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

type Addr = { emailAddress?: { name?: string; address?: string } };
type Mail = {
  id: string;
  subject: string | null;
  from?: Addr;
  toRecipients?: Addr[];
  ccRecipients?: Addr[];
  body?: { content?: string };
  receivedDateTime: string;
};
type Chat = { id: string; topic: string | null; lastMessagePreview?: { createdDateTime?: string } | null };
type ChatMsg = {
  id: string;
  createdDateTime: string;
  from?: { user?: { id?: string; displayName?: string } } | null;
  body?: { content?: string };
  mentions?: { mentioned?: { user?: { id?: string } } }[];
};
type Event = {
  id: string;
  subject: string | null;
  organizer?: { emailAddress?: { name?: string } };
  body?: { content?: string };
  end?: { dateTime?: string };
};

const addr = (a?: Addr) => `${a?.emailAddress?.name ?? ''} <${a?.emailAddress?.address ?? ''}>`;
// To / Cc / Date: who it's addressed to (often the owner) and when it was sent ("tomorrow" is relative to it)
const mailText = (m: Mail) =>
  [
    `Subject: ${m.subject ?? ''}`,
    `From: ${addr(m.from)}`,
    ...(m.toRecipients?.length ? [`To: ${m.toRecipients.map(addr).join(', ')}`] : []),
    ...(m.ccRecipients?.length ? [`Cc: ${m.ccRecipients.map(addr).join(', ')}`] : []),
    `Date: ${m.receivedDateTime}`,
    '',
    plain(m.body?.content ?? ''),
  ]
    .join('\n')
    .slice(0, 8000);

export const microsoft: Provider = {
  id: 'microsoft',
  configured: () => !!Deno.env.get('MS_CLIENT_ID') && !!Deno.env.get('MS_CLIENT_SECRET'),

  authorizeUrl: ({ state, redirectUri, challenge }) =>
    `${authBase()}/authorize?${new URLSearchParams({
      client_id: Deno.env.get('MS_CLIENT_ID') ?? '',
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    })}`,

  exchange: ({ code, redirectUri, verifier }) =>
    tokenRequest(`${authBase()}/token`, {
      client_id: Deno.env.get('MS_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('MS_CLIENT_SECRET') ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      scope: SCOPES,
    }),

  refresh: (t) =>
    tokenRequest(`${authBase()}/token`, {
      client_id: Deno.env.get('MS_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('MS_CLIENT_SECRET') ?? '',
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token ?? '',
      scope: SCOPES,
    }),

  account: async (t) => {
    const me = await graph<{ id: string; mail?: string | null; userPrincipalName?: string; displayName?: string }>(
      t,
      '/me?$select=id,mail,userPrincipalName,displayName',
    );
    return { label: me.mail ?? me.userPrincipalName ?? me.displayName ?? 'Microsoft 365', cursor: { me_id: me.id } };
  },

  fetchNew: async (t, cursor) => {
    const now = new Date();
    const since = typeof cursor.since === 'string' ? cursor.since : new Date(now.getTime() - FIRST_LOOK_BACK_MS).toISOString();
    const meId = typeof cursor.me_id === 'string' ? cursor.me_id : (await graph<{ id: string }>(t, '/me?$select=id')).id;
    const items: Fetched[] = [];
    const textBody = { Prefer: 'outlook.body-content-type="text"' };
    const sel = '$select=id,subject,from,toRecipients,ccRecipients,body,receivedDateTime&$top=20';

    // Outlook: flagged mail touched since the last check
    try {
      const flagged = await graph<{ value: Mail[] }>(
        t,
        `/me/messages?$filter=${encodeURIComponent(`flag/flagStatus eq 'flagged' and lastModifiedDateTime ge ${since}`)}&${sel}`,
        textBody,
      );
      for (const m of flagged.value)
        items.push({
          externalId: m.id,
          source: 'outlook',
          text: mailText(m),
          sender: m.from?.emailAddress?.name,
          subject: m.subject,
          receivedAt: m.receivedDateTime,
        });
    } catch (e) {
      console.warn('outlook flagged', (e as Error).message);
    }
    // Outlook: anything dropped in a folder called "Muntej"
    try {
      const folders = await graph<{ value: { id: string }[] }>(
        t,
        `/me/mailFolders?$filter=${encodeURIComponent("displayName eq 'Muntej'")}&$select=id`,
      );
      if (folders.value[0]) {
        const inFolder = await graph<{ value: Mail[] }>(
          t,
          `/me/mailFolders/${folders.value[0].id}/messages?$filter=${encodeURIComponent(`lastModifiedDateTime ge ${since}`)}&${sel}`,
          textBody,
        );
        for (const m of inFolder.value)
          if (!items.some((x) => x.externalId === m.id))
            items.push({
              externalId: m.id,
              source: 'outlook',
              text: mailText(m),
              sender: m.from?.emailAddress?.name,
              subject: m.subject,
              receivedAt: m.receivedDateTime,
            });
      }
    } catch (e) {
      console.warn('outlook folder', (e as Error).message);
    }

    // Teams: messages that @mention you in chats active since the last check
    try {
      const chats = await graph<{ value: Chat[] }>(t, '/me/chats?$expand=lastMessagePreview&$top=30');
      for (const c of chats.value) {
        const last = c.lastMessagePreview?.createdDateTime;
        if (!last || last < since) continue;
        const msgs = await graph<{ value: ChatMsg[] }>(t, `/me/chats/${c.id}/messages?$top=20`);
        for (const m of msgs.value) {
          if (m.createdDateTime < since || m.from?.user?.id === meId) continue;
          if (!(m.mentions ?? []).some((x) => x.mentioned?.user?.id === meId)) continue;
          const who = m.from?.user?.displayName ?? '';
          items.push({
            externalId: m.id,
            source: 'teams',
            text: `${c.topic ? `Chat: ${c.topic}\n` : ''}${who}: ${plain(m.body?.content ?? '')}`.slice(0, 4000),
            sender: who,
            subject: c.topic,
            receivedAt: m.createdDateTime,
          });
        }
      }
    } catch (e) {
      console.warn('teams', (e as Error).message);
    }

    // Calendar: meetings that ended since the last check and carry notes / an agenda
    try {
      const events = await graph<{ value: Event[] }>(
        t,
        `/me/calendarView?startDateTime=${encodeURIComponent(new Date(Date.parse(since) - 8 * 3_600_000).toISOString())}&endDateTime=${encodeURIComponent(now.toISOString())}&$select=id,subject,organizer,body,end&$top=20`,
        textBody,
      );
      for (const ev of events.value) {
        const end = ev.end?.dateTime ? Date.parse(`${ev.end.dateTime}Z`) : NaN;
        if (Number.isNaN(end) || end < Date.parse(since) || end > now.getTime()) continue;
        const notes = plain(ev.body?.content ?? '');
        if (notes.length < 80) continue; // an empty invite has nothing to act on
        items.push({
          externalId: ev.id,
          source: 'calendar',
          text: `Meeting: ${ev.subject ?? ''}\nOrganizer: ${ev.organizer?.emailAddress?.name ?? ''}\n\n${notes}`.slice(0, 8000),
          sender: ev.organizer?.emailAddress?.name,
          subject: ev.subject,
          receivedAt: new Date(end).toISOString(),
        });
      }
    } catch (e) {
      console.warn('calendar', (e as Error).message);
    }

    // a little overlap: the same message is never read twice (external id), so nothing slips between runs
    return { items, cursor: { ...cursor, me_id: meId, since: new Date(now.getTime() - 2 * 60_000).toISOString() } };
  },
};
