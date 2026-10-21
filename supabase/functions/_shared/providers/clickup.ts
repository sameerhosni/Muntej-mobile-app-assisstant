// ClickUp: tasks assigned to the person, in every workspace they belong to. Two ways to connect:
//   • personal API token (no setup): ClickUp → avatar → Settings → Apps → API Token → Generate → copy (pk_…)
//   • sign in with ClickUp (OAuth app: env CLICKUP_CLIENT_ID / CLICKUP_CLIENT_SECRET, redirect URL domain = the
//     Supabase project's). ClickUp tokens don't expire.
// The first check takes every open task assigned to you; after that, only tasks created or changed since the last check.
// They're already tasks, so no AI reading: each becomes your task in Muntej (unless it duplicates an open one).
import { tokenRequest, type Fetched, type Provider, type Tokens } from '../connections.ts';

const API = 'https://api.clickup.com/api/v2';

async function cu<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: token } });
  if (res.status === 401) throw new Error('Sign in again');
  if (!res.ok) throw new Error(`ClickUp ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

type CuTask = {
  id: string;
  name: string;
  text_content?: string | null;
  due_date?: string | null;
  priority?: { priority?: string } | null;
  url?: string;
  date_updated?: string;
  list?: { name?: string };
};

const PRIORITY: Record<string, 'low' | 'medium' | 'high' | 'urgent'> = { urgent: 'urgent', high: 'high', normal: 'medium', low: 'low' };

async function whoAmI(token: string) {
  const { user } = await cu<{ user: { id: number; username?: string; email?: string } }>(token, '/user');
  const { teams } = await cu<{ teams: { id: string; name: string }[] }>(token, '/team');
  return { label: user.email ?? user.username ?? 'ClickUp', cursor: { user_id: user.id, teams: teams.map((t) => t.id) } };
}

export const clickup: Provider = {
  id: 'clickup',
  configured: () => !!Deno.env.get('CLICKUP_CLIENT_ID') && !!Deno.env.get('CLICKUP_CLIENT_SECRET'),

  authorizeUrl: ({ state, redirectUri }) =>
    `https://app.clickup.com/api?${new URLSearchParams({ client_id: Deno.env.get('CLICKUP_CLIENT_ID') ?? '', redirect_uri: redirectUri, state })}`,

  // ClickUp takes the code as query parameters and gives a token that never expires
  exchange: async ({ code }) => {
    const url = `${API}/oauth/token?${new URLSearchParams({
      client_id: Deno.env.get('CLICKUP_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('CLICKUP_CLIENT_SECRET') ?? '',
      code,
    })}`;
    return tokenRequest(url, {});
  },
  refresh: async (t: Tokens) => t,

  account: (t) => whoAmI(t.access_token),
  personalToken: { fields: ['token'], verify: (c) => whoAmI(c.token) },

  fetchNew: async (t, cursor) => {
    const token = t.access_token;
    const userId = cursor.user_id ?? (await whoAmI(token)).cursor.user_id;
    const teams = Array.isArray(cursor.teams) ? (cursor.teams as string[]) : (await whoAmI(token)).cursor.teams;
    const since = typeof cursor.since_ms === 'number' ? cursor.since_ms : null;
    const items: Fetched[] = [];
    for (const team of teams) {
      const q = new URLSearchParams({ include_closed: 'false', subtasks: 'true', order_by: 'updated', page: '0' });
      q.append('assignees[]', String(userId));
      if (since) q.set('date_updated_gt', String(since));
      const { tasks } = await cu<{ tasks: CuTask[] }>(token, `/team/${team}/task?${q}`);
      for (const task of tasks) {
        const due = task.due_date ? new Date(Number(task.due_date)).toISOString() : null;
        const priority = PRIORITY[task.priority?.priority ?? ''] ?? 'medium';
        items.push({
          externalId: task.id,
          source: 'clickup',
          text: [task.name, task.text_content ?? ''].join('\n').slice(0, 4000),
          subject: task.list?.name ?? null,
          receivedAt: task.date_updated ? new Date(Number(task.date_updated)).toISOString() : null,
          task: { title: task.name, due_at: due, priority, description: task.text_content ?? null, link: task.url ?? null },
        });
      }
    }
    return { items, cursor: { ...cursor, user_id: userId, teams, since_ms: Date.now() - 2 * 60_000 } };
  },
};
