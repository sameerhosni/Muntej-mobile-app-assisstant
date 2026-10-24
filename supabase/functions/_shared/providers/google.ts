// Google Workspace / Gmail (Gmail + Google Calendar), signed in as the person.
// Google Cloud → APIs & Services: enable Gmail API + Google Calendar API; OAuth consent screen (External; while in
// "Testing", add each person as a test user); Credentials → OAuth client ID (Web application) with the redirect URI
// <SUPABASE_URL>/functions/v1/connect/callback. Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (scripts/set-google.ps1).
// Scopes: gmail.readonly, calendar.readonly (read only: Muntej never sends, deletes or changes mail or events).
//
// What Muntej reads (only what's new since the last check, never the whole mailbox):
//   Gmail     new inbox mail from people (not promotions / social, not no-reply / notification senders, not Muntej's
//             sign-in code mails); only mails with real tasks show up; the first
//             check reads the last 7 days
//   Calendar  meetings that just ended and have notes / an agenda in the invite
// Everything found WAITS for the person's OK in "Add from a message" (owner's decision: Gmail tasks are confirmed,
// never added by themselves): see confirmFirst.
import { tokenRequest, type Fetched, type Provider, type Tokens } from '../connections.ts';

// meetings.space.readonly: Google Meet transcripts (Meet REST API; enable "Google Meet REST API" in Google Cloud)
const SCOPES =
  'openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/meetings.space.readonly' +
  // Google Chat (Workspace accounts only; enable "Google Chat API" + its Configuration page in Google Cloud)
  ' https://www.googleapis.com/auth/chat.spaces.readonly https://www.googleapis.com/auth/chat.messages.readonly https://www.googleapis.com/auth/chat.memberships.readonly' +
  // turn on automatic transcripts for the meetings you organise, so nobody has to press "Start transcription"
  ' https://www.googleapis.com/auth/meetings.space.settings';
const CHAT = 'https://chat.googleapis.com/v1';
const MEET = 'https://meet.googleapis.com/v2';
const FIRST_LOOK_BACK_MS = 7 * 24 * 3_600_000; // the first check reads the last week, not years of history
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
// only mail people wrote (owner: "retrieve only tasks coming from the team or a human, relevant to my scope"): no
// Promotions / Social / Updates / Forums (tool notifications and alerts live there), no no-reply senders. People
// emailing themselves a task is still read.
const INBOX_QUERY =
  'in:inbox -category:promotions -category:social -category:updates -category:forums -subject:"Muntej code" -from:(noreply OR no-reply OR donotreply OR do-not-reply OR notifications OR notification OR alerts OR alert OR security OR mailer-daemon OR postmaster)';

// sender names that are systems, not people (the part before @)
const SYSTEM_SENDER =
  /^(no-?reply|do-?not-?reply|notifications?|notify|alerts?|security|accounts?|account-security|mailer(-daemon)?|postmaster|bounces?|billing|invoices?|receipts?|news(letter)?|updates?|digest|marketing|hello|hey|hi|team|support|help|info|system|robot|bot|automated?|calendar-notification|feedback)([+._-].*)?$/i;

/** mail a system sent (alerts, notifications, newsletters, receipts), told apart by its headers and sender */
function automated(h: (name: string) => string): boolean {
  const auto = h('auto-submitted').toLowerCase();
  if (auto && auto !== 'no') return true;
  if (h('list-unsubscribe') || h('list-id') || h('feedback-id') || h('x-auto-response-suppress')) return true;
  if (/^(bulk|list|junk)$/i.test(h('precedence').trim())) return true;
  const address = (h('from').match(/<([^>]+)>/)?.[1] ?? h('from')).trim();
  return SYSTEM_SENDER.test(address.split('@')[0] ?? '');
}

async function apiPatch<T>(t: Tokens, url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('Sign in again');
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** switch "transcribe automatically" on for the meetings this person organises in the next 7 days (once each) */
async function autoTranscripts(t: Tokens, done: string[]): Promise<{ done: string[]; error: string | null }> {
  const seen = new Set(done);
  let error: string | null = null;
  try {
    const now = Date.now();
    const events = await api<{ items?: (GEvent & { conferenceData?: { conferenceId?: string }; organizer?: { self?: boolean } })[] }>(
      t,
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
        timeMin: new Date(now).toISOString(),
        timeMax: new Date(now + 7 * 86_400_000).toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '50',
      })}`,
    );
    for (const e of events.items ?? []) {
      const code = e.conferenceData?.conferenceId;
      if (!code || !e.organizer?.self || seen.has(code)) continue;
      try {
        const space = await api<{ name?: string; config?: { artifactConfig?: { transcriptionConfig?: { autoTranscriptionGeneration?: string } } } }>(
          t,
          `${MEET}/spaces/${code}`,
        );
        if (space.name && space.config?.artifactConfig?.transcriptionConfig?.autoTranscriptionGeneration !== 'ON')
          await apiPatch(t, `${MEET}/${space.name}?updateMask=config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration`, {
            config: { artifactConfig: { transcriptionConfig: { autoTranscriptionGeneration: 'ON' } } },
          });
        seen.add(code);
      } catch (x) {
        error = (x as Error).message.slice(0, 200);
      }
    }
  } catch (x) {
    if ((x as Error).message === 'Sign in again') throw x;
    error = (x as Error).message.slice(0, 200);
  }
  return { done: [...seen].slice(-200), error };
}

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
    // whether this sign-in allowed Meet (older ones didn't: the app asks to sign in again for it)
    return {
      label: me.email ?? me.name ?? 'Google',
      cursor: {
        meet_ok: (t.scope ?? '').includes('meetings'),
        tx_ok: (t.scope ?? '').includes('meetings.space.settings'),
        chat_ok: (t.scope ?? '').includes('chat.messages'),
      },
    };
  },

  fetchNew: async (t, cursor, features = {}) => {
    const now = new Date();
    const since = typeof cursor.since === 'string' ? cursor.since : new Date(now.getTime() - FIRST_LOOK_BACK_MS).toISOString();
    const items: Fetched[] = [];
    // the account's switches (Sources screen): each part is on unless turned off
    const on = (k: 'gmail' | 'calendar' | 'meet' | 'chat') => features[k] !== false;

    // Gmail: every new inbox mail since the last check (Gmail's "after:" is in whole seconds)
    if (on('gmail'))
      try {
        const q = `${INBOX_QUERY} after:${Math.floor(Date.parse(since) / 1000)}`;
        const list = await api<{ messages?: { id: string }[] }>(t, `${GMAIL}/messages?${new URLSearchParams({ q, maxResults: '20' })}`);
        for (const { id } of list.messages ?? []) {
          const m = await api<GMessage>(t, `${GMAIL}/messages/${id}?format=full`);
          const h = (name: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === name)?.value ?? '';
          // a system's mail is never a task (even when it says "check" or "review"): skipped before Saree3 reads it
          if (automated(h)) continue;
          const from = h('from');
          const subject = h('subject');
          const body = withoutQuoted(bodyOf(m.payload));
          if (!body && !subject) continue;
          items.push({
            externalId: m.id,
            source: 'gmail',
            // To / Cc / Date: who it's addressed to (often the owner) and when it was sent ("tomorrow" is relative to it)
            text: [
              `Subject: ${subject}`,
              `From: ${from}`,
              ...(h('to') ? [`To: ${h('to')}`] : []),
              ...(h('cc') ? [`Cc: ${h('cc')}`] : []),
              ...(m.internalDate ? [`Date: ${new Date(Number(m.internalDate)).toISOString()}`] : []),
              '',
              body,
            ]
              .join('\n')
              .slice(0, 8000),
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
    if (on('calendar'))
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

    // Google Meet: meetings that ended since the last check and have a transcript (Workspace plans with transcripts,
    // when the host turned on transcription or "Take notes with Gemini"): who said what → the action items
    const meetOk = (t.scope ?? '').includes('meetings');
    // a failed Meet read is kept on the connection (e.g. "Google Meet REST API" not enabled) so it can be seen
    let meetError: string | null = null;
    // what the last read saw (meetings ended in the last day, and how much transcript each had), for troubleshooting
    const meetSeen: { end: string; chars: number }[] = [];
    if (on('meet') && meetOk)
      try {
        // a day back: transcripts can take a while after the meeting, and one already read is never read twice
        const filter = `end_time>="${new Date(Date.parse(since) - 24 * 3_600_000).toISOString()}"`;
        const recs = await api<{ conferenceRecords?: MeetRecord[] }>(
          t,
          `${MEET}/conferenceRecords?${new URLSearchParams({ filter, pageSize: '10' })}`,
        );
        for (const rec of recs.conferenceRecords ?? []) {
          if (!rec.endTime) continue;
          const text = await meetTranscript(t, rec.name);
          meetSeen.push({ end: rec.endTime, chars: text.length });
          if (text.length < 80) continue; // no transcript (yet), or nothing said
          // the meeting's name, organiser and invitees from its Calendar event (matched by the Meet code), so Saree3
          // knows who assigned what and to whom
          const ev = await meetEvent(t, rec).catch(() => null);
          const head = [
            `Google Meet meeting${ev?.summary ? `: ${ev.summary}` : ''} (${rec.startTime ?? ''} → ${rec.endTime})`,
            ...(ev?.organizer ? [`Organiser: ${ev.organizer}`] : []),
            ...(ev?.attendees.length ? [`Invited: ${ev.attendees.join(', ')}`] : []),
            'Lines are "speaker: words". Whoever asks someone to do something is who assigned it.',
          ].join('\n');
          items.push({
            externalId: `meet:${rec.name}`,
            source: 'meet',
            text: `${head}\n\n${text}`.slice(0, 38_000),
            sender: ev?.organizer ?? 'Google Meet',
            subject: ev?.summary ?? null,
            receivedAt: rec.endTime,
          });
        }
      } catch (e) {
        if ((e as Error).message === 'Sign in again') throw e;
        meetError = (e as Error).message.slice(0, 200);
        console.warn('google meet', meetError);
      }

    // Automatic transcripts: every meeting you organise in the next week gets "transcribe automatically" switched on
    // (Meet settings API), so the transcript exists without anyone pressing a button and Saree3 can read it after.
    const txOk = (t.scope ?? '').includes('meetings.space.settings');
    let tx: { done: string[]; error: string | null } = { done: Array.isArray(cursor.tx_done) ? (cursor.tx_done as string[]) : [], error: null };
    if (on('meet') && meetOk && txOk) tx = await autoTranscripts(t, tx.done);

    // Google Chat: new messages people wrote in the spaces and direct messages this person is in. Each conversation's
    // new messages are read together (with who said them), so "Faisal, the deck by tomorrow" makes sense in context.
    // Apps / bots are skipped. Workspace accounts only (Google says no for personal Gmail: chat_error tells the app).
    const chatOk = (t.scope ?? '').includes('chat.messages');
    let chatError: string | null = null;
    if (on('chat') && chatOk)
      try {
        const after = new Date(Date.parse(since) - 60_000).toISOString();
        const spaces = await api<{ spaces?: ChatSpace[] }>(t, `${CHAT}/spaces?${new URLSearchParams({ pageSize: '50' })}`);
        // the most recently active first; a few per run is plenty
        const active = (spaces.spaces ?? [])
          .filter((sp) => !sp.lastActiveTime || sp.lastActiveTime > after)
          .sort((a, b) => (b.lastActiveTime ?? '').localeCompare(a.lastActiveTime ?? ''))
          .slice(0, 15);
        for (const sp of active) {
          const list = await api<{ messages?: ChatMessage[] }>(
            t,
            `${CHAT}/${sp.name}/messages?${new URLSearchParams({ filter: `createTime > "${after}"`, pageSize: '50', orderBy: 'createTime ASC' })}`,
          );
          const said = (list.messages ?? []).filter((m) => m.sender?.type !== 'BOT' && (m.text ?? '').trim());
          if (!said.length) continue;
          // names: from the message, else from the space's members (user auth often leaves displayName empty)
          const names = new Map<string, string>();
          if (said.some((m) => !m.sender?.displayName))
            try {
              const mem = await api<{ memberships?: { member?: { name?: string; displayName?: string } }[] }>(
                t,
                `${CHAT}/${sp.name}/members?${new URLSearchParams({ pageSize: '100' })}`,
              );
              for (const x of mem.memberships ?? []) if (x.member?.name && x.member.displayName) names.set(x.member.name, x.member.displayName);
            } catch {
              // names are nice to have
            }
          const who = (m: ChatMessage) => m.sender?.displayName || names.get(m.sender?.name ?? '') || 'Someone';
          const where = sp.spaceType === 'DIRECT_MESSAGE' ? 'Direct message' : (sp.displayName ?? 'Space');
          const last = said[said.length - 1];
          items.push({
            externalId: `gchat:${last.name}`,
            source: 'google_chat',
            text: [
              `Google Chat · ${where}`,
              ...said.map((m) => `[${m.createTime ?? ''}] ${who(m)}: ${(m.text ?? '').trim()}`),
            ]
              .join('\n')
              .slice(0, 12_000),
            sender: said.length === 1 ? who(last) : where,
            subject: where,
            receivedAt: last.createTime ?? null,
          });
        }
      } catch (e) {
        if ((e as Error).message === 'Sign in again') throw e;
        chatError = (e as Error).message.slice(0, 200);
        console.warn('google chat', chatError);
      }

    // a little overlap: the same message is never read twice (external id), so nothing slips between runs
    return {
      items,
      cursor: { ...cursor, meet_ok: meetOk, meet_error: meetError, meet_seen: meetSeen, tx_ok: txOk, tx_done: tx.done, tx_error: tx.error, meet_checked: on('meet') && meetOk ? now.toISOString() : (cursor.meet_checked ?? null), chat_ok: chatOk, chat_error: chatError, since: new Date(now.getTime() - 2 * 60_000).toISOString() },
    };
  },
};

type MeetRecord = { name: string; space?: string; startTime?: string; endTime?: string };
type ChatSpace = { name: string; displayName?: string; spaceType?: string; lastActiveTime?: string };
type ChatMessage = { name: string; text?: string; createTime?: string; sender?: { name?: string; displayName?: string; type?: string } };
type MeetTranscript = { name: string; state?: string };
type MeetEntry = { participant?: string; text?: string };
type MeetParticipant = {
  name: string;
  signedinUser?: { displayName?: string };
  anonymousUser?: { displayName?: string };
  phoneUser?: { displayName?: string };
};

/** one Meet call's transcript as "Name: what they said" lines (empty when the meeting had none) */
/** the Calendar event a Meet conference belongs to: same Meet code, around the same time */
async function meetEvent(t: Tokens, rec: MeetRecord): Promise<{ summary: string | null; organizer: string | null; attendees: string[] } | null> {
  if (!rec.space || !rec.startTime) return null;
  const space = await api<{ meetingCode?: string }>(t, `${MEET}/${rec.space}`);
  if (!space.meetingCode) return null;
  const start = Date.parse(rec.startTime);
  const events = await api<{ items?: (GEvent & { conferenceData?: { conferenceId?: string }; attendees?: { displayName?: string; email?: string }[] })[] }>(
    t,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
      timeMin: new Date(start - 3 * 3_600_000).toISOString(),
      timeMax: new Date(start + 3 * 3_600_000).toISOString(),
      singleEvents: 'true',
      maxResults: '50',
    })}`,
  );
  const ev = (events.items ?? []).find((e) => e.conferenceData?.conferenceId === space.meetingCode);
  if (!ev) return null;
  return {
    summary: ev.summary ?? null,
    organizer: ev.organizer?.displayName ?? ev.organizer?.email ?? null,
    attendees: (ev.attendees ?? []).map((a) => a.displayName ?? a.email ?? '').filter(Boolean).slice(0, 30),
  };
}

async function meetTranscript(t: Tokens, record: string): Promise<string> {
  const { transcripts } = await api<{ transcripts?: MeetTranscript[] }>(t, `${MEET}/${record}/transcripts`);
  const ready = (transcripts ?? []).filter((x) => x.state === 'FILE_GENERATED' || x.state === 'ENDED');
  if (!ready.length) return '';
  const { participants } = await api<{ participants?: MeetParticipant[] }>(t, `${MEET}/${record}/participants?pageSize=100`);
  const who = new Map(
    (participants ?? []).map((p) => [p.name, p.signedinUser?.displayName ?? p.anonymousUser?.displayName ?? p.phoneUser?.displayName ?? '']),
  );
  const lines: string[] = [];
  for (const tr of ready) {
    let page: string | undefined;
    do {
      const q = new URLSearchParams({ pageSize: '100', ...(page ? { pageToken: page } : {}) });
      const res = await api<{ transcriptEntries?: MeetEntry[]; nextPageToken?: string }>(t, `${MEET}/${tr.name}/entries?${q}`);
      for (const e of res.transcriptEntries ?? []) if (e.text) lines.push(`${who.get(e.participant ?? '') || '?'}: ${e.text}`);
      page = res.nextPageToken;
    } while (page && lines.length < 2000);
  }
  return lines.join('\n');
}
