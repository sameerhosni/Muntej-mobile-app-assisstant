// Work overview (screen 56): every number on the screen and the tasks behind it, from tasks (RLS: what you may see),
// your pending decisions and the org tree. Pure: no queries here, so it can be checked with hand-made tasks.
// A "team" is one of your direct reports and everyone under them; your direct people with no team of their own
// (and you) are "Your direct team". Works for any company shape without a departments table.
import type { TaskWithPeople } from '@/lib/api';
import type { Person } from '@/features/org/model';
import { closedAt, DAY_MS, isLateOpen, isOpen, startOfDay, startOfWeek } from '@/features/dashboard/metrics';

export const DIRECT = 'direct';
export type Team = { key: string; lead: Person | null; open: number };

/** which team a task's owner belongs to, seen from `meId` */
export function teamOf(ownerId: string | null, meId: string, byId: Map<string, Person>, hasTeam: Set<string>): string {
  if (!ownerId || ownerId === meId) return DIRECT;
  let cur = byId.get(ownerId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.manager_id === meId) return hasTeam.has(cur.id) ? cur.id : DIRECT;
    cur = cur.manager_id ? byId.get(cur.manager_id) : undefined;
  }
  return DIRECT;
}

export type Metric =
  | 'open'
  | 'urgent'
  | 'late'
  | 'approval'
  | 'quiet'
  | 'noOwner'
  | 'noDue'
  | 'toReview'
  | 'st_done'
  | 'st_progress'
  | 'st_waiting'
  | 'st_other'
  | 'pr_urgent'
  | 'pr_high'
  | 'pr_medium'
  | 'pr_low'
  | 'my_today'
  | 'my_own'
  | 'my_given'
  | 'my_doneWeek'
  | 'rv_new'
  | 'rv_back'
  | 'rv_ready'
  | 'rv_done';

export type Overview = {
  lists: Record<Metric, TaskWithPeople[]>;
  decisions: number;
  teams: Team[];
  /** the follow-up total: everything that needs someone to act (a task counted once) */
  followUp: number;
};

const QUIET_MS = 3 * DAY_MS;

export function computeOverview(input: {
  tasks: TaskWithPeople[];
  people: Person[];
  meId: string;
  decisions: number;
  team: string; // 'all' | DIRECT | a lead's id
  since: Date;
  now?: Date;
}): Overview {
  const now = input.now ?? new Date();
  const t0 = now.getTime();
  const { meId } = input;
  const byId = new Map(input.people.map((p) => [p.id, p]));
  const hasTeam = new Set(input.people.filter((p) => p.manager_id && p.status !== 'deleted').map((p) => p.manager_id!));
  const directs = input.people.filter((p) => p.manager_id === meId && p.status !== 'deleted' && hasTeam.has(p.id));

  const live = input.tasks.filter((x) => x.status !== 'draft' && x.status !== 'cancelled');
  const keyOf = (x: TaskWithPeople) => teamOf(x.owner_id, meId, byId, hasTeam);

  // teams with their open work (all of them, before the filter)
  const openAll = live.filter(isOpen);
  const teams: Team[] = [
    ...directs.map((p) => ({ key: p.id, lead: p, open: openAll.filter((x) => keyOf(x) === p.id).length })),
    { key: DIRECT, lead: null, open: openAll.filter((x) => keyOf(x) === DIRECT).length },
  ];

  const scoped = input.team === 'all' ? live : live.filter((x) => keyOf(x) === input.team);
  const open = scoped.filter(isOpen);
  const dayEnd = startOfDay(now).getTime() + DAY_MS;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const weekStart = startOfWeek(now).getTime();
  const since = input.since.getTime();
  const at = (iso: string | null) => (iso ? Date.parse(iso) : 0);

  const lists: Record<Metric, TaskWithPeople[]> = {
    open,
    urgent: open.filter((x) => x.priority === 'urgent' || x.priority === 'high'),
    late: open.filter((x) => isLateOpen(x, t0)),
    approval: open.filter((x) => x.status === 'submitted' && x.assigner_id === meId),
    quiet: open.filter((x) => x.status !== 'submitted' && t0 - at(x.updated_at) > QUIET_MS),
    noOwner: open.filter((x) => !x.owner_id),
    noDue: open.filter((x) => !x.due_at),
    toReview: open.filter((x) => x.status === 'submitted'),
    st_done: scoped.filter((x) => (closedAt(x) ?? 0) >= monthStart),
    st_progress: open.filter((x) => x.status === 'in_progress'),
    st_waiting: open.filter((x) => x.status === 'assigned' || x.status === 'submitted'),
    st_other: open.filter((x) => x.status === 'blocked' || x.status === 'returned'),
    pr_urgent: open.filter((x) => x.priority === 'urgent'),
    pr_high: open.filter((x) => x.priority === 'high'),
    pr_medium: open.filter((x) => x.priority === 'medium'),
    pr_low: open.filter((x) => x.priority === 'low'),
    my_today: open.filter((x) => x.owner_id === meId && !!x.due_at && at(x.due_at) < dayEnd),
    my_own: open.filter((x) => x.owner_id === meId),
    my_given: open.filter((x) => x.assigner_id === meId && x.owner_id !== meId),
    my_doneWeek: scoped.filter((x) => (closedAt(x) ?? 0) >= weekStart),
    rv_new: open.filter((x) => x.status === 'assigned' && at(x.created_at) >= since),
    rv_back: open.filter((x) => x.status === 'returned' && at(x.updated_at) >= since),
    rv_ready: open.filter((x) => x.status === 'submitted' && at(x.updated_at) >= since),
    rv_done: scoped.filter((x) => (closedAt(x) ?? 0) >= since),
  };
  const needs = new Set([...lists.late, ...lists.quiet, ...lists.noOwner, ...lists.noDue, ...lists.toReview].map((x) => x.id));
  const decisions = input.team === 'all' ? input.decisions : 0;
  return { lists, decisions, teams, followUp: needs.size + decisions };
}
