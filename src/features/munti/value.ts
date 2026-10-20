// What Muntej gave you in the last 7 days — the "value realization" Munti talks about.
// Manager: follow-ups Muntej sent for you (others' tasks you can see) + updates collected without asking.
// Employee: status reports you didn't have to write (Muntej asked + your hand-ins reported for you).
// Time uses the same rates as the Home tiles (src/features/home/value.ts) so the numbers match everywhere.
// RLS-scoped counts; live (Realtime refreshes every query).
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useMyProfile, useTasks } from '@/lib/api';
import { MIN_PER_FOLLOWUP, MIN_PER_UPDATE } from '@/features/home/value';

const WEEK = 7 * 86_400_000;

export type WeekValue = {
  role: 'mgr' | 'emp';
  /** follow-ups Muntej sent to others on tasks you can see (manager) */
  chases: number;
  /** status reports you didn't write: follow-ups answered for you + tasks you handed in (employee) */
  reports: number;
  /** tasks finished (done or handed in) */
  done: number;
  /** of those, on or before their due date */
  onTime: number;
  /** finished on time back-to-back, newest first */
  streak: number;
  minutes: number;
};

type CountRes = PromiseLike<{ count: number | null; error: { message: string } | null }>;
type Loose = CountRes & {
  eq: (c: string, v: unknown) => Loose;
  neq: (c: string, v: unknown) => Loose;
  gte: (c: string, v: string) => Loose;
};
const from = (t: string) =>
  (supabase as unknown as { from: (t: string) => { select: (c: string, o: { count: 'exact'; head: true }) => Loose } }).from(t);

async function count(q: CountRes) {
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return r.count ?? 0;
}

export function useWeekValue(): WeekValue | null {
  const me = useMyProfile();
  const tasks = useTasks();
  const meId = me.data?.id;

  const counts = useQuery({
    queryKey: ['muntiValue', meId ?? ''],
    enabled: !!meId,
    queryFn: async () => {
      const since = new Date(Date.now() - WEEK).toISOString();
      const [chases, toMe, updates] = await Promise.all([
        count(from('followups').select('id', { count: 'exact', head: true }).neq('recipient_id', meId!).eq('status', 'sent').gte('sent_at', since)),
        count(from('followups').select('id', { count: 'exact', head: true }).eq('recipient_id', meId!).eq('status', 'sent').gte('sent_at', since)),
        count(from('activity_log').select('id', { count: 'exact', head: true }).eq('action', 'update_received').gte('created_at', since)),
      ]);
      return { chases, toMe, updates };
    },
  });

  return useMemo(() => {
    if (!me.data || !tasks.data || !counts.data) return null;
    const employee = me.data.role === 'employee';
    const now = Date.now();
    const mine = employee ? tasks.data.filter((x) => x.owner_id === me.data!.id) : tasks.data;
    const finished = mine
      .filter((x) => (x.status === 'done' || x.status === 'submitted') && now - Date.parse(x.updated_at) < WEEK)
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    const onTimeOf = (x: (typeof finished)[number]) => !x.due_at || Date.parse(x.closed_at ?? x.updated_at) <= Date.parse(x.due_at);
    const onTime = finished.filter(onTimeOf).length;
    let streak = 0;
    for (const x of finished) {
      if (!x.due_at || !onTimeOf(x)) break;
      streak++;
    }
    const { chases, toMe, updates } = counts.data;
    const reports = toMe + finished.length;
    const minutes = employee ? reports * MIN_PER_UPDATE : chases * MIN_PER_FOLLOWUP + updates * MIN_PER_UPDATE;
    return { role: employee ? 'emp' : 'mgr', chases, reports, done: finished.length, onTime, streak, minutes };
  }, [me.data, tasks.data, counts.data]);
}

/** "25 min" / "1.5 h" in the right language (keys from the munti strings) */
export function timeLabel(minutes: number, t: (k: string, v?: Record<string, unknown>) => string, fmt: (n: number, d?: number) => string) {
  return minutes < 60 ? t('time_min', { n: fmt(Math.round(minutes)) }) : t('time_h', { n: fmt(Math.round((minutes / 60) * 10) / 10, 1) });
}
