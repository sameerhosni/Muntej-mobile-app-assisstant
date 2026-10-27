import { useMemo } from 'react';
import { useMyProfile, useTasks, type TaskPriority, type TaskWithPeople } from '@/lib/api';
import { matchesSearch } from '@/lib/search';

export type SortMode = 'newest' | 'priority';
/** mine / team / done = the three tabs (open work for you, open work for others, finished); the rest live in "⋯". */
export type TaskListFilter = 'mine' | 'team' | 'done' | 'all' | 'assigned' | 'late' | 'unassigned' | 'unlinked' | 'cancelled';

export const SORT_MODES: SortMode[] = ['newest', 'priority'];
export const FILTERS: TaskListFilter[] = ['mine', 'team', 'done', 'all', 'assigned', 'late', 'unassigned', 'unlinked', 'cancelled'];
export const TABS: TaskListFilter[] = ['mine', 'team', 'done'];
/** the extra filters behind "⋯" */
export const MORE_FILTERS: TaskListFilter[] = ['all', 'assigned', 'late', 'unassigned', 'unlinked', 'cancelled'];

const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const newestFirst = (a: TaskWithPeople, b: TaskWithPeople) => b.created_at.localeCompare(a.created_at);

/** Newest first, or urgent → high → medium → low with newest first inside each level. */
export function sortTasks(tasks: TaskWithPeople[], mode: SortMode): TaskWithPeople[] {
  const out = [...tasks];
  if (mode === 'newest') return out.sort(newestFirst);
  return out.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || newestFirst(a, b));
}

/** Past its due date and still on the owner (not done, cancelled, or handed in for review). */
export function isLate(task: Pick<TaskWithPeople, 'due_at' | 'status'>, now = Date.now()): boolean {
  if (!task.due_at || task.status === 'done' || task.status === 'cancelled' || task.status === 'submitted') return false;
  return new Date(task.due_at).getTime() < now;
}

/** Finished (done, or sent in for review) after its due date: not late any more, but not on time either. */
export function finishedLate(task: Pick<TaskWithPeople, 'due_at' | 'status' | 'closed_at' | 'updated_at'>): boolean {
  if (!task.due_at || (task.status !== 'done' && task.status !== 'submitted')) return false;
  const at = task.status === 'done' ? (task.closed_at ?? task.updated_at) : task.updated_at;
  return new Date(at).getTime() > new Date(task.due_at).getTime();
}

/** Does this task belong under the given filter? "Cancelled" shows only cancelled tasks; every other filter hides them. */
export function inFilter(task: TaskWithPeople, filter: TaskListFilter, meId: string | undefined, now = Date.now()): boolean {
  if (filter === 'cancelled') return task.status === 'cancelled';
  if (task.status === 'cancelled') return false;
  // finished for the person: done, or (their own) handed in for review
  const finishedForMe = task.status === 'done' || (task.status === 'submitted' && !!meId && task.owner_id === meId);
  switch (filter) {
    case 'mine':
      return !!meId && task.owner_id === meId && !finishedForMe;
    case 'team':
      return task.owner_id !== meId && task.status !== 'done';
    case 'done':
      return finishedForMe;
    case 'assigned':
      return !!meId && task.assigner_id === meId;
    case 'late':
      return isLate(task, now);
    case 'unassigned':
      return !task.owner_id;
    case 'unlinked':
      // open work that doesn't serve any objective yet (a gap)
      return !task.objective_id && task.status !== 'done';
    default:
      return true;
  }
}

export function filterTasks(tasks: TaskWithPeople[], filter: TaskListFilter, meId: string | undefined): TaskWithPeople[] {
  const now = Date.now();
  return tasks.filter((x) => inFilter(x, filter, meId, now));
}

/** Search over title, owner name (EN/AR), workspace name (EN/AR) and goal. */
export function matchesTask(task: TaskWithPeople, search: string): boolean {
  return matchesSearch(
    search,
    task.title,
    task.owner?.full_name,
    task.owner?.full_name_ar,
    task.workspace?.name,
    task.workspace?.name_ar,
    task.goal,
  );
}

/** Fields Muntej still needs before it can fully run the task. */
export function missingFields(task: TaskWithPeople): ('owner' | 'due' | 'dod')[] {
  if (task.status === 'done' || task.status === 'cancelled') return [];
  const out: ('owner' | 'due' | 'dod')[] = [];
  if (!task.owner_id) out.push('owner');
  if (!task.due_at) out.push('due');
  if (!task.definition_of_done?.trim()) out.push('dod');
  return out;
}

/**
 * All tasks the user may see (RLS), newest first from the server, then searched, filtered + sorted locally.
 * `counts` are per filter on the searched list, so each chip matches what you'd see when you tap it.
 */
export function useTaskList(filter: TaskListFilter, sort: SortMode, search = '') {
  const me = useMyProfile();
  const query = useTasks({ orderBy: 'created' });
  const meId = me.data?.id;
  const { rows, counts } = useMemo(() => {
    const now = Date.now();
    const searched = (query.data ?? []).filter((x) => matchesTask(x, search));
    const counts = Object.fromEntries(
      FILTERS.map((f) => [f, searched.filter((x) => inFilter(x, f, meId, now)).length]),
    ) as Record<TaskListFilter, number>;
    const sorted = sortTasks(
      searched.filter((x) => inFilter(x, filter, meId, now)),
      sort,
    );
    // open lists: late ones always on top (no separate "Late" filter needed)
    const rows = filter === 'mine' || filter === 'team' ? [...sorted.filter((x) => isLate(x, now)), ...sorted.filter((x) => !isLate(x, now))] : sorted;
    return { rows, counts };
  }, [query.data, filter, meId, sort, search]);
  return { me, query, rows, counts, role: me.data?.role === 'employee' ? ('employee' as const) : ('manager' as const) };
}
