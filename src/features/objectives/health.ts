// Objective health: progress vs time used, a label, and the gaps Muntej can point at (and mostly fix).
import { useMemo } from 'react';
import { ACTIVE_STATUSES, type Profile, type TaskWithPeople } from '@/lib/api';
import { isLate } from '@/features/tasks/model';
import type { Objective } from './api';

export type HealthLabel = 'onTrack' | 'behind' | 'atRisk' | 'achieved' | 'missed' | 'cancelled';

export type ObjectiveGaps = {
  noTasks: boolean;
  unassigned: TaskWithPeople[];
  /** open tasks due after the objective ends or before it starts */
  outsideWindow: TaskWithPeople[];
  late: TaskWithPeople[];
  /** profile ids of task owners (in this objective) carrying more than they can */
  overloadedOwners: string[];
  missingDoneWhen: TaskWithPeople[];
};

export type ObjectiveHealth = {
  label: HealthLabel;
  /** 0–100: done / non-cancelled linked tasks */
  progress: number;
  /** 0–100: share of the objective window already elapsed */
  timeUsed: number;
  /** whole days until due (negative = overdue) */
  daysLeft: number;
  total: number;
  done: number;
  /** linked, non-cancelled */
  tasks: TaskWithPeople[];
  gaps: ObjectiveGaps;
  /** number of distinct gap kinds present (for badges) */
  gapKinds: number;
};

const DAY = 86_400_000;
const isOpen = (t: TaskWithPeople) => t.status !== 'done' && t.status !== 'cancelled';

/** Same rule as the team alerts: more open tasks than max(5, weekly hours / 5). */
export function overloadLimit(p: Pick<Profile, 'weekly_capacity_hours'> | undefined) {
  return Math.max(5, Math.round((p?.weekly_capacity_hours || 40) / 5));
}

/** owner id → open (active) task count, over every task the user can see. */
export function openCountByOwner(tasks: TaskWithPeople[]) {
  const m = new Map<string, number>();
  for (const t of tasks) if (t.owner_id && ACTIVE_STATUSES.includes(t.status)) m.set(t.owner_id, (m.get(t.owner_id) ?? 0) + 1);
  return m;
}

export function overloadedIds(people: Profile[], openCounts: Map<string, number>) {
  return new Set(people.filter((p) => (openCounts.get(p.id) ?? 0) > overloadLimit(p)).map((p) => p.id));
}

export function objectiveHealth(
  o: Objective,
  linkedAll: TaskWithPeople[],
  overloaded: Set<string>,
  now = Date.now(),
): ObjectiveHealth {
  const tasks = linkedAll.filter((t) => t.status !== 'cancelled');
  const done = tasks.filter((t) => t.status === 'done').length;
  const total = tasks.length;
  const progress = total ? Math.round((done / total) * 100) : 0;
  const start = new Date(o.start_at).getTime();
  const due = new Date(o.due_at).getTime();
  const span = Math.max(due - start, 1);
  const timeUsed = Math.round(Math.max(0, Math.min(1, (now - start) / span)) * 100);
  const daysLeft = Math.ceil((due - now) / DAY);

  const open = tasks.filter(isOpen);
  const late = open.filter((t) => isLate(t, now));
  const gaps: ObjectiveGaps = {
    noTasks: total === 0,
    unassigned: open.filter((t) => !t.owner_id),
    outsideWindow: open.filter((t) => {
      if (!t.due_at) return false;
      const d = new Date(t.due_at).getTime();
      return d > due || d < start;
    }),
    late,
    overloadedOwners: [...new Set(open.map((t) => t.owner_id).filter((id): id is string => !!id && overloaded.has(id)))],
    missingDoneWhen: open.filter((t) => !t.definition_of_done?.trim()),
  };
  const gapKinds =
    (gaps.noTasks ? 1 : 0) +
    [gaps.unassigned, gaps.outsideWindow, gaps.late, gaps.overloadedOwners, gaps.missingDoneWhen].filter((g) => g.length > 0).length;

  let label: HealthLabel;
  if (o.status !== 'active') label = o.status === 'achieved' ? 'achieved' : o.status === 'missed' ? 'missed' : 'cancelled';
  else if (timeUsed - progress > 25 || late.length > 0) label = 'atRisk';
  else if (progress >= timeUsed - 10) label = 'onTrack';
  else label = 'behind';

  return { label, progress, timeUsed, daysLeft, total, done, tasks, gaps, gapKinds };
}

export type GlobalGaps = {
  /** open tasks not linked to any objective */
  unlinked: TaskWithPeople[];
  atRisk: number;
  overloaded: Profile[];
  /** people in my scope with no open task in an active objective */
  withoutObjective: Profile[];
};

/** Everyone under `meId` (direct and indirect reports), from the team list. */
export function reportsOf(meId: string | undefined, team: Profile[]): Profile[] {
  if (!meId) return [];
  const byManager = new Map<string, Profile[]>();
  for (const p of team) if (p.manager_id) byManager.set(p.manager_id, [...(byManager.get(p.manager_id) ?? []), p]);
  const out: Profile[] = [];
  const seen = new Set<string>([meId]);
  const queue = [meId];
  while (queue.length) {
    for (const c of byManager.get(queue.shift()!) ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
      queue.push(c.id);
    }
  }
  return out;
}

/** Health for every objective + the cross-objective gaps for the top strip. */
export function useObjectivesHealth(
  objectives: Objective[] | undefined,
  tasks: TaskWithPeople[] | undefined,
  team: Profile[] | undefined,
  me: Profile | undefined,
) {
  return useMemo(() => {
    const now = Date.now();
    const allTasks = tasks ?? [];
    const people = team ?? [];
    const counts = openCountByOwner(allTasks);
    const overloaded = overloadedIds(people, counts);
    const byObjective = new Map<string, TaskWithPeople[]>();
    for (const t of allTasks) if (t.objective_id) byObjective.set(t.objective_id, [...(byObjective.get(t.objective_id) ?? []), t]);

    const health = new Map<string, ObjectiveHealth>();
    for (const o of objectives ?? []) health.set(o.id, objectiveHealth(o, byObjective.get(o.id) ?? [], overloaded, now));

    const activeIds = new Set((objectives ?? []).filter((o) => o.status === 'active').map((o) => o.id));
    const inActive = new Set(
      allTasks.filter((t) => t.objective_id && activeIds.has(t.objective_id) && isOpen(t) && t.owner_id).map((t) => t.owner_id!),
    );
    // scope: my reports (+ me when I lead someone); an employee sees just themselves
    const reports = reportsOf(me?.id, people).filter((p) => p.status === 'active');
    const scope = me ? (reports.length ? [me, ...reports] : [me]) : [];

    const global: GlobalGaps = {
      unlinked: allTasks.filter((t) => isOpen(t) && t.status !== 'draft' && !t.objective_id),
      atRisk: [...health.values()].filter((h) => h.label === 'atRisk').length,
      overloaded: scope.filter((p) => overloaded.has(p.id)),
      withoutObjective: scope.filter((p) => !inActive.has(p.id)),
    };
    return { health, global, openCounts: counts, overloaded };
  }, [objectives, tasks, team, me]);
}
