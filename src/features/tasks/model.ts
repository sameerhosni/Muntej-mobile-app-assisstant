import { useMemo } from 'react';
import { useMyProfile, useTasks, type TaskPriority, type TaskWithPeople } from '@/lib/api';

export type SortMode = 'newest' | 'priority';
export type TaskListFilter = 'all' | 'mine' | 'assigned' | 'cancelled';

export const SORT_MODES: SortMode[] = ['newest', 'priority'];
export const FILTERS: TaskListFilter[] = ['all', 'mine', 'assigned', 'cancelled'];

const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const newestFirst = (a: TaskWithPeople, b: TaskWithPeople) => b.created_at.localeCompare(a.created_at);

/** Newest first, or urgent → high → medium → low with newest first inside each level. */
export function sortTasks(tasks: TaskWithPeople[], mode: SortMode): TaskWithPeople[] {
  const out = [...tasks];
  if (mode === 'newest') return out.sort(newestFirst);
  return out.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || newestFirst(a, b));
}

/** "Cancelled" shows only cancelled tasks; every other filter hides them (done tasks stay, shown as done). */
export function filterTasks(tasks: TaskWithPeople[], filter: TaskListFilter, meId: string | undefined): TaskWithPeople[] {
  if (filter === 'cancelled') return tasks.filter((x) => x.status === 'cancelled');
  const open = tasks.filter((x) => x.status !== 'cancelled');
  if (filter === 'mine') return meId ? open.filter((x) => x.owner_id === meId) : [];
  if (filter === 'assigned') return meId ? open.filter((x) => x.assigner_id === meId) : [];
  return open;
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

/** All tasks the user may see (RLS), newest first from the server, then filtered + sorted locally. */
export function useTaskList(filter: TaskListFilter, sort: SortMode) {
  const me = useMyProfile();
  const query = useTasks({ orderBy: 'created' });
  const meId = me.data?.id;
  const rows = useMemo(
    () => sortTasks(filterTasks(query.data ?? [], filter, meId), sort),
    [query.data, filter, meId, sort],
  );
  return { me, query, rows, role: me.data?.role === 'employee' ? ('employee' as const) : ('manager' as const) };
}
