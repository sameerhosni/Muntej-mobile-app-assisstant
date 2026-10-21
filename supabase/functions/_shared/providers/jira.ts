// Jira Cloud: open issues assigned to the person, connected with their own API token (no admin setup):
//   id.atlassian.com → Security → Create and manage API tokens → Create → copy; plus their Jira site
//   (company.atlassian.net) and the email they sign in with.
// The first check takes every open issue assigned to you; after that, only issues changed since the last check.
// They're already tasks, so no AI reading: each becomes your task in Muntej (unless it duplicates an open one).
import type { Fetched, Provider, Tokens } from '../connections.ts';
import { noOAuth } from './no-oauth.ts';

type Issue = {
  id: string;
  key: string;
  fields: {
    summary: string;
    duedate?: string | null;
    priority?: { name?: string } | null;
    updated?: string;
    project?: { name?: string };
  };
};

const PRIORITY: Record<string, 'low' | 'medium' | 'high' | 'urgent'> = {
  highest: 'urgent',
  blocker: 'urgent',
  critical: 'urgent',
  high: 'high',
  medium: 'medium',
  low: 'low',
  lowest: 'low',
  minor: 'low',
  trivial: 'low',
};

/** "https://Company.atlassian.net/jira/…" or "company" → "company.atlassian.net" */
function siteOf(raw: string) {
  const s = raw.trim().replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
  if (!s) throw new Error('Jira site is missing');
  return s.includes('.') ? s : `${s}.atlassian.net`;
}

async function api<T>(site: string, email: string, token: string, path: string): Promise<T> {
  const res = await fetch(`https://${site}${path}`, {
    headers: { Authorization: `Basic ${btoa(`${email}:${token}`)}`, Accept: 'application/json' },
  });
  if (res.status === 401 || res.status === 403) throw new Error('Sign in again');
  if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export const jira: Provider = {
  id: 'jira',
  ...noOAuth,
  personalToken: {
    fields: ['site', 'email', 'token'],
    verify: async (c) => {
      const site = siteOf(c.site ?? '');
      const me = await api<{ accountId: string; emailAddress?: string; displayName?: string }>(site, c.email, c.token, '/rest/api/3/myself');
      return { label: `${me.emailAddress ?? c.email} · ${site}`, cursor: { site, account_id: me.accountId } };
    },
  },

  tasks: {
    targets: async (t, cursor) => {
      const site = typeof cursor.site === 'string' ? cursor.site : siteOf(t.extra?.site ?? '');
      const r = await api<{ values: { id: string; key: string; name: string }[] }>(site, t.extra?.email ?? '', t.access_token, '/rest/api/3/project/search?maxResults=100');
      return r.values.map((p) => ({ id: p.key, name: `${p.name} (${p.key})` }));
    },
    create: async (t, cursor, projectKey, task) => {
      const site = typeof cursor.site === 'string' ? cursor.site : siteOf(t.extra?.site ?? '');
      const email = t.extra?.email ?? '';
      // "Task" if the project has it, else its first non-sub-task type
      const types = await api<{ issueTypes?: { id: string; name: string; subtask: boolean }[]; values?: { id: string; name: string; subtask: boolean }[] }>(
        site,
        email,
        t.access_token,
        `/rest/api/3/issue/createmeta/${projectKey}/issuetypes`,
      );
      const list = types.issueTypes ?? types.values ?? [];
      const type = list.find((x) => x.name.toLowerCase() === 'task') ?? list.find((x) => !x.subtask);
      const body = {
        fields: {
          project: { key: projectKey },
          summary: task.title,
          issuetype: type ? { id: type.id } : { name: 'Task' },
          ...(task.due_at ? { duedate: new Date(Date.parse(task.due_at) + 3 * 3_600_000).toISOString().slice(0, 10) } : {}),
          ...(cursor.account_id ? { assignee: { accountId: cursor.account_id } } : {}),
          ...(task.description
            ? { description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: task.description.slice(0, 5000) }] }] } }
            : {}),
        },
      };
      const res = await fetch(`https://${site}/rest/api/3/issue`, {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`${email}:${t.access_token}`)}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const made = (await res.json()) as { id: string; key: string };
      return { id: made.id, url: `https://${site}/browse/${made.key}` };
    },
    update: async (t, cursor, id, task) => {
      const site = typeof cursor.site === 'string' ? cursor.site : siteOf(t.extra?.site ?? '');
      const email = t.extra?.email ?? '';
      const res = await fetch(`https://${site}/rest/api/3/issue/${id}`, {
        method: 'PUT',
        headers: { Authorization: `Basic ${btoa(`${email}:${t.access_token}`)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { summary: task.title, duedate: task.due_at ? new Date(Date.parse(task.due_at) + 3 * 3_600_000).toISOString().slice(0, 10) : null },
        }),
      });
      if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
    // workflows differ: take whichever transition lands in the "Done" category
    close: async (t, cursor, id) => {
      const site = typeof cursor.site === 'string' ? cursor.site : siteOf(t.extra?.site ?? '');
      const email = t.extra?.email ?? '';
      const { transitions } = await api<{ transitions: { id: string; to?: { statusCategory?: { key?: string } } }[] }>(
        site,
        email,
        t.access_token,
        `/rest/api/3/issue/${id}/transitions`,
      );
      const done = transitions.find((x) => x.to?.statusCategory?.key === 'done');
      if (!done) return;
      const res = await fetch(`https://${site}/rest/api/3/issue/${id}/transitions`, {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`${email}:${t.access_token}`)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ transition: { id: done.id } }),
      });
      if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
    closedAmong: async (t, cursor, ids) => {
      if (!ids.length) return new Set<string>();
      const site = typeof cursor.site === 'string' ? cursor.site : siteOf(t.extra?.site ?? '');
      const q = new URLSearchParams({ jql: `id in (${ids.join(',')}) AND statusCategory = Done`, fields: 'id', maxResults: '100' });
      const { issues } = await api<{ issues: { id: string }[] }>(site, t.extra?.email ?? '', t.access_token, `/rest/api/3/search/jql?${q}`);
      return new Set((issues ?? []).map((i) => i.id));
    },
  },

  fetchNew: async (t: Tokens, cursor) => {
    const site = typeof cursor.site === 'string' ? cursor.site : siteOf(t.extra?.site ?? '');
    const email = t.extra?.email ?? '';
    const since = typeof cursor.since_ms === 'number' ? cursor.since_ms : null;
    // relative minutes keep it independent of the Jira user's time zone
    const window = since ? ` AND updated >= -${Math.ceil((Date.now() - since) / 60_000) + 2}m` : '';
    const jql = `assignee = currentUser() AND statusCategory != Done${window} ORDER BY updated DESC`;
    const q = new URLSearchParams({ jql, fields: 'summary,duedate,priority,updated,project', maxResults: '50' });
    const { issues } = await api<{ issues: Issue[] }>(site, email, t.access_token, `/rest/api/3/search/jql?${q}`);
    const items: Fetched[] = (issues ?? []).map((i) => ({
      externalId: i.id,
      source: 'jira',
      text: `${i.key} ${i.fields.summary}`,
      subject: i.fields.project?.name ?? null,
      receivedAt: i.fields.updated ?? null,
      task: {
        title: `${i.key} · ${i.fields.summary}`.slice(0, 200),
        // Jira due dates have no time: 17:00 Riyadh that day
        due_at: i.fields.duedate ? `${i.fields.duedate}T17:00:00+03:00` : null,
        priority: PRIORITY[(i.fields.priority?.name ?? '').toLowerCase()] ?? 'medium',
        link: `https://${site}/browse/${i.key}`,
      },
    }));
    return { items, cursor: { ...cursor, site, since_ms: Date.now() - 2 * 60_000 } };
  },
};
