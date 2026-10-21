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

  tasks: {
    // every list in every space (folders included), as "Space › Folder › List"
    targets: async (t, cursor) => {
      const token = t.access_token;
      const teams = Array.isArray(cursor.teams) ? (cursor.teams as string[]) : (await whoAmI(token)).cursor.teams;
      const out: { id: string; name: string }[] = [];
      for (const team of teams) {
        const { spaces } = await cu<{ spaces: { id: string; name: string }[] }>(token, `/team/${team}/space?archived=false`);
        for (const sp of spaces) {
          const [{ lists }, { folders }] = await Promise.all([
            cu<{ lists: { id: string; name: string }[] }>(token, `/space/${sp.id}/list?archived=false`),
            cu<{ folders: { name: string; lists: { id: string; name: string }[] }[] }>(token, `/space/${sp.id}/folder?archived=false`),
          ]);
          for (const l of lists) out.push({ id: l.id, name: `${sp.name} › ${l.name}` });
          for (const f of folders) for (const l of f.lists ?? []) out.push({ id: l.id, name: `${sp.name} › ${f.name} › ${l.name}` });
          if (out.length >= 100) return out;
        }
      }
      return out;
    },
    create: async (t, cursor, listId, task) => {
      const res = await fetch(`${API}/list/${listId}/task`, {
        method: 'POST',
        headers: { Authorization: t.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: task.title,
          description: task.description ?? undefined,
          due_date: task.due_at ? Date.parse(task.due_at) : undefined,
          due_date_time: !!task.due_at,
          priority: { urgent: 1, high: 2, medium: 3, low: 4 }[task.priority],
          assignees: cursor.user_id ? [Number(cursor.user_id)] : [],
        }),
      });
      if (!res.ok) throw new Error(`ClickUp ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const made = (await res.json()) as { id: string; url?: string };
      return { id: made.id, url: made.url ?? null };
    },
    update: async (t, _cursor, id, task) => {
      const res = await fetch(`${API}/task/${id}`, {
        method: 'PUT',
        headers: { Authorization: t.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: task.title, due_date: task.due_at ? Date.parse(task.due_at) : null, due_date_time: !!task.due_at }),
      });
      if (!res.ok) throw new Error(`ClickUp ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
    // statuses are per list: move it to that list's "closed" (or "done") status
    close: async (t, _cursor, id) => {
      const task = await cu<{ list: { id: string } }>(t.access_token, `/task/${id}`);
      const list = await cu<{ statuses: { status: string; type: string }[] }>(t.access_token, `/list/${task.list.id}`);
      const done = list.statuses.find((s) => s.type === 'closed') ?? list.statuses.find((s) => s.type === 'done');
      if (!done) return;
      const res = await fetch(`${API}/task/${id}`, {
        method: 'PUT',
        headers: { Authorization: t.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: done.status }),
      });
      if (!res.ok) throw new Error(`ClickUp ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
    closedAmong: async (t, _cursor, ids) => {
      const closed = new Set<string>();
      for (const id of ids) {
        try {
          const task = await cu<{ status?: { type?: string }; archived?: boolean }>(t.access_token, `/task/${id}`);
          if (task.archived || task.status?.type === 'closed' || task.status?.type === 'done') closed.add(id);
        } catch (e) {
          if (/404/.test((e as Error).message)) closed.add(id); // deleted in ClickUp: treat as finished
        }
      }
      return closed;
    },
  },
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
