// "What I'm working on": everything Saree3 is handling for you right now, from data the app already has, each as one
// plain line with its state (owner: "this is the behaviour I need Muntej to have with users": say what you're
// doing, keep retrying by yourself, say "nothing for you to do", come back with the result or exactly what's needed).
//   needs     only you can move it (a decision, a tool sign-in, tasks found in your tools)
//   working   Saree3 is on it (late work he's chasing, a tool he keeps retrying)
//   waiting   he's waiting on someone else, and when he nudges them next
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useDecisions, useMyProfile, useTasks, useTeam } from '@/lib/api';
import { useConnections } from '@/features/sources/connections';
import { useIncomingCount } from '@/features/incoming/api';
import type { Href } from 'expo-router';

export type JobKind = 'needs' | 'working' | 'waiting';
export type Job = { key: string; kind: JobKind; icon: string; text: string; sub: string; href?: Href };
type T = (k: string, o?: Record<string, unknown>) => string;

const DAY = 86_400_000;

/** a tool's error in plain words, and whether it's yours to fix */
function plain(err: string, t: T): { text: string; yours: boolean } {
  if (/sign in again|401|invalid_grant|revoked|expired/i.test(err)) return { text: t('errSignIn'), yours: true };
  if (/not been used|disabled|403/i.test(err)) return { text: t('errService'), yours: false };
  if (/workspace|personal/i.test(err)) return { text: t('errWorkspace'), yours: false };
  return { text: t('errTool'), yours: false };
}

export function useSaree3Jobs(t: T, lang: string) {
  const me = useMyProfile();
  const tasks = useTasks();
  const team = useTeam();
  const decisions = useDecisions('pending');
  const conns = useConnections();
  const incoming = useIncomingCount();
  const meId = me.data?.id;
  const ar = lang === 'ar';

  // tasks I gave that aren't confirmed yet → when Saree3 nudges them next
  const given = (tasks.data ?? []).filter((x) => x.assigner_id === meId && x.owner_id && x.owner_id !== meId && x.status === 'assigned');
  const next = useQuery({
    queryKey: ['saree3Next', given.map((x) => x.id).sort().join(',')],
    enabled: given.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('followups')
        .select('task_id, scheduled_at')
        .in('task_id', given.map((x) => x.id))
        .eq('status', 'scheduled')
        .order('scheduled_at');
      const m = new Map<string, string>();
      for (const f of data ?? []) if (!m.has(f.task_id as string)) m.set(f.task_id as string, f.scheduled_at as string);
      return m;
    },
  });
  // what I asked my manager and haven't heard back on
  const asked = useQuery({
    queryKey: ['saree3Asked', meId],
    enabled: !!meId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('decisions')
        .select('id, manager_id, task:tasks(title)')
        .eq('requested_by', meId!)
        .neq('manager_id', meId!)
        .eq('status', 'pending');
      return (data ?? []) as unknown as { id: string; manager_id: string; task: { title: string } | null }[];
    },
  });

  const first = (id: string | null | undefined) => {
    const p = (team.data ?? []).find((x) => x.id === id);
    return p ? ((ar && p.full_name_ar) || p.full_name).split(' ')[0] : t('someone');
  };
  const at = (iso: string) => {
    const d = new Date(iso);
    const sameDay = Math.abs(d.getTime() - Date.now()) < DAY && d.getDate() === new Date().getDate();
    return new Intl.DateTimeFormat(ar ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', {
      ...(sameDay ? {} : { weekday: 'short' }),
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Asia/Riyadh',
    }).format(d);
  };

  const jobs: Job[] = [];
  // ── needs you ──
  for (const d of decisions.data ?? [])
    jobs.push({ key: `d${d.id}`, kind: 'needs', icon: '🙋', text: (ar && d.title_ar) || d.title, sub: t('decide'), href: '/04-decisions' });
  if (incoming.count) jobs.push({ key: 'inc', kind: 'needs', icon: '📥', text: t('incoming', { count: incoming.count }), sub: t('incomingSub'), href: '/42-incoming' });
  // ── tools: broken ones Saree3 keeps retrying (or that need your sign-in) ──
  for (const c of conns.data ?? []) {
    const cur = (c.cursor ?? {}) as Record<string, unknown>;
    const err =
      (c.status === 'error' && c.last_error) ||
      (c.features?.meet !== false && typeof cur.meet_error === 'string' ? (cur.meet_error as string) : null) ||
      (c.features?.chat !== false && typeof cur.chat_error === 'string' ? (cur.chat_error as string) : null);
    if (!err) continue;
    const p = plain(err, t);
    const every = c.read_every_min || 10;
    const nextRead = c.last_sync_at ? new Date(Date.parse(c.last_sync_at) + every * 60_000).toISOString() : new Date().toISOString();
    jobs.push({
      key: `c${c.id}`,
      kind: p.yours ? 'needs' : 'working',
      icon: p.yours ? '🙋' : '🔄',
      text: `${t(`tool_${c.provider}`)}${c.account_label ? ` · ${c.account_label}` : ''}: ${p.text}`,
      sub: p.yours ? t('reconnect') : t('retrying', { when: at(nextRead) }),
      href: p.yours ? '/12-sources' : '/42-incoming',
    });
  }
  // ── working: late work Saree3 is chasing for you ──
  const now = Date.now();
  for (const x of (tasks.data ?? []).filter(
    (x) => x.assigner_id === meId && x.owner_id !== meId && x.due_at && Date.parse(x.due_at) < now && ['assigned', 'in_progress', 'returned'].includes(x.status),
  ))
    jobs.push({ key: `l${x.id}`, kind: 'working', icon: '⏰', text: t('late', { title: x.title, name: first(x.owner_id) }), sub: t('nothing'), href: { pathname: '/14-task-detail', params: { id: x.id } } });
  // ── waiting on others ──
  for (const x of given) {
    const n = next.data?.get(x.id);
    jobs.push({
      key: `w${x.id}`,
      kind: 'waiting',
      icon: '⏳',
      text: t('confirm', { name: first(x.owner_id), title: x.title }),
      sub: n ? t('nextNudge', { when: at(n) }) : t('nothing'),
      href: { pathname: '/14-task-detail', params: { id: x.id } },
    });
  }
  for (const d of asked.data ?? [])
    jobs.push({ key: `a${d.id}`, kind: 'waiting', icon: '⏳', text: t('answer', { name: first(d.manager_id), title: d.task?.title ?? '…' }), sub: t('tellYou') });
  for (const x of (tasks.data ?? []).filter((x) => x.owner_id === meId && x.status === 'submitted'))
    jobs.push({ key: `r${x.id}`, kind: 'waiting', icon: '⏳', text: t('review', { title: x.title }), sub: t('tellYou'), href: { pathname: '/14-task-detail', params: { id: x.id } } });

  return {
    jobs,
    needs: jobs.filter((j) => j.kind === 'needs').length,
    ready: !!tasks.data && !!conns.data,
  };
}
