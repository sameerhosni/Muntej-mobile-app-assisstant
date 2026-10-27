// Task metrics shared by screens 05 (Brief), 16 (Dashboard) and 17 (Summaries).
// All numbers are computed from live `tasks` rows (RLS-scoped) — no estimates here.
import { ACTIVE_STATUSES, type Profile, type TaskWithPeople } from '@/lib/api';

export const DAY_MS = 86_400_000;

export type OnTime = 'on_time' | 'late' | null;

/** On-time verdict for one task: done before/at due = on time; done after due or overdue & open = late; else not judged. */
export function onTimeState(t: TaskWithPeople, now = Date.now()): OnTime {
  if (!t.due_at || t.status === 'cancelled' || t.status === 'draft') return null;
  const due = new Date(t.due_at).getTime();
  if (t.status === 'done') {
    const closed = new Date(t.closed_at ?? t.updated_at).getTime();
    return closed <= due ? 'on_time' : 'late';
  }
  return due < now ? 'late' : null;
}

export function onTimeRate(tasks: TaskWithPeople[], now = Date.now()) {
  let onTime = 0;
  let late = 0;
  for (const t of tasks) {
    const s = onTimeState(t, now);
    if (s === 'on_time') onTime++;
    else if (s === 'late') late++;
  }
  const judged = onTime + late;
  return { onTime, late, judged, rate: judged > 0 ? Math.round((onTime / judged) * 100) : null };
}

export function isOpen(t: TaskWithPeople) {
  return ACTIVE_STATUSES.includes(t.status);
}

/** Late = past due and not finished. Work already sent in for review is finished for its owner, so it isn't late
 *  (owner, 27 Oct: the Late tile opened a task that was already done); it counts as "finished late" instead. */
export function isLateOpen(t: TaskWithPeople, now = Date.now()) {
  return isOpen(t) && t.status !== 'submitted' && !!t.due_at && new Date(t.due_at).getTime() < now;
}

export function closedAt(t: TaskWithPeople): number | null {
  if (t.status !== 'done') return null;
  return new Date(t.closed_at ?? t.updated_at).getTime();
}

/** A task is "in" a window if it closed in it, or (open/late) it was due in it. */
export function touchedIn(t: TaskWithPeople, from: number, to: number) {
  const c = closedAt(t);
  if (c !== null) return c >= from && c < to;
  if (!t.due_at) return false;
  const d = new Date(t.due_at).getTime();
  return d >= from && d < to;
}

/** Saudi work week: starts Sunday 00:00 local time. */
export function startOfWeek(d = new Date()) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

export function startOfDay(d = new Date()) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

export function personName(p: Pick<Profile, 'full_name' | 'full_name_ar'> | null | undefined, lang: string) {
  if (!p) return '';
  return lang === 'ar' && p.full_name_ar ? p.full_name_ar : p.full_name;
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}
