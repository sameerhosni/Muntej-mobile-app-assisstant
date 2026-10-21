// Trello: open cards the person is a member of, connected with their own API key + token (no admin setup):
//   trello.com/power-ups/admin → New → (any name) → API key → Generate a new API key → copy the key, then the
//   "Token" link next to it → Allow → copy the token.
// The first check takes every open card you're on; after that, only cards with activity since the last check.
// Cards marked complete are skipped. No AI reading: each card becomes your task in Muntej (unless it's a duplicate).
import type { Fetched, Provider, Tokens } from '../connections.ts';
import { noOAuth } from './no-oauth.ts';

const API = 'https://api.trello.com/1';

type Card = { id: string; name: string; desc?: string; due?: string | null; dueComplete?: boolean; url?: string; dateLastActivity?: string; closed?: boolean };

async function api<T>(key: string, token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${API}${path}?${new URLSearchParams({ ...params, key, token })}`, { headers: { Accept: 'application/json' } });
  if (res.status === 401) throw new Error('Sign in again');
  if (!res.ok) throw new Error(`Trello ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export const trello: Provider = {
  id: 'trello',
  ...noOAuth,
  personalToken: {
    fields: ['key', 'token'],
    verify: async (c) => {
      const me = await api<{ id: string; username?: string; fullName?: string; email?: string }>(c.key, c.token, '/members/me', { fields: 'username,fullName,email' });
      return { label: me.email ?? me.fullName ?? me.username ?? 'Trello', cursor: { member_id: me.id } };
    },
  },

  fetchNew: async (t: Tokens, cursor) => {
    const key = t.extra?.key ?? '';
    const since = typeof cursor.since === 'string' ? cursor.since : null;
    const cards = await api<Card[]>(key, t.access_token, '/members/me/cards', { filter: 'open', fields: 'name,desc,due,dueComplete,url,dateLastActivity,closed' });
    const items: Fetched[] = cards
      .filter((c) => !c.closed && !c.dueComplete && (!since || (c.dateLastActivity ?? '') > since))
      .map((c) => ({
        externalId: c.id,
        source: 'trello',
        text: [c.name, c.desc ?? ''].join('\n').slice(0, 4000),
        receivedAt: c.dateLastActivity ?? null,
        task: { title: c.name.slice(0, 200), due_at: c.due ?? null, priority: 'medium' as const, description: c.desc ?? null, link: c.url ?? null },
      }));
    return { items, cursor: { ...cursor, since: new Date(Date.now() - 2 * 60_000).toISOString() } };
  },
};
