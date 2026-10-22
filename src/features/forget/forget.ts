// The Create & Forget north-star (BRD v1.2, O1): of the tasks you handed off (you assigned, someone else owns) that
// closed in the period, how many closed with ZERO touches from you after creating them (tasks.manager_touches,
// counted by supabase/migrations/20261022100000_manager_touches.sql). Target ≥ 70%.
import { useMyProfile, useTasks, type TaskWithPeople } from '@/lib/api';
import { periodStart, type Period } from '@/features/receipt/useReceipt';

export const FORGET_TARGET = 70;

export type ForgetRate = {
  closed: number;
  forgotten: number;
  /** 0–100, null when nothing you handed off closed yet */
  pct: number | null;
  /** your handed-off tasks you stepped into most (open or closed), for "where you still step in" */
  mostTouched: TaskWithPeople[];
};

const touchesOf = (t: TaskWithPeople) => (t as TaskWithPeople & { manager_touches?: number }).manager_touches ?? 0;

export function useForgetRate(period: Period = 'week'): ForgetRate & { ready: boolean } {
  const me = useMyProfile();
  const tasks = useTasks();
  const meId = me.data?.id;
  const since = periodStart(period).getTime();
  const handedOff = (tasks.data ?? []).filter((t) => !!meId && t.assigner_id === meId && !!t.owner_id && t.owner_id !== meId);
  const closed = handedOff.filter((t) => t.status === 'done' && Date.parse(t.closed_at ?? t.updated_at) >= since);
  const forgotten = closed.filter((t) => touchesOf(t) === 0).length;
  const mostTouched = handedOff
    .filter((t) => touchesOf(t) > 0 && Date.parse(t.updated_at) >= since)
    .sort((a, b) => touchesOf(b) - touchesOf(a))
    .slice(0, 3);
  return {
    ready: !!tasks.data && !!meId,
    closed: closed.length,
    forgotten,
    pct: closed.length ? Math.round((forgotten / closed.length) * 100) : null,
    mostTouched,
  };
}

export { touchesOf };
