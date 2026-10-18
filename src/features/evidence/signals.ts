// Screen 10: estimate real progress from signals (subtasks done, evidence uploaded, last activity)
// and compare with what the owner reported (tasks.progress). Reads are RLS-scoped.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TaskWithPeople } from '@/lib/api';

export type RawSignals = {
  subtasks: { task_id: string; done: boolean; updated_at: string }[];
  evidence: { task_id: string; created_at: string }[];
  updates: { task_id: string | null; created_at: string }[];
};

export type TaskSignal = {
  task: TaskWithPeople;
  reported: number;
  signal: number;
  gap: number;
  stepsDone: number;
  stepsTotal: number;
  files: number;
  /** Latest real signal (evidence, ticked step, owner update); null = none at all. */
  lastAt: string | null;
  idleDays: number;
};

/** Gap (percentage points) above which Muntej suggests offering help. */
export const LARGE_GAP = 25;

const DAY = 86400000;

export function useTaskSignals(taskIds: string[]) {
  const ids = [...new Set(taskIds)].sort();
  return useQuery({
    queryKey: ['tasks', 'evidenceSignals', ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<RawSignals> => {
      const [s, e, a] = await Promise.all([
        supabase.from('subtasks').select('task_id, done, updated_at').in('task_id', ids),
        supabase.from('evidence').select('task_id, created_at').in('task_id', ids),
        supabase
          .from('activity_log')
          .select('task_id, created_at')
          .in('task_id', ids)
          .in('action', ['update_received', 'submission_received']),
      ]);
      for (const r of [s, e, a]) if (r.error) throw new Error(r.error.message);
      return { subtasks: s.data ?? [], evidence: e.data ?? [], updates: a.data ?? [] };
    },
  });
}

function maxIso(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function computeSignal(task: TaskWithPeople, raw: RawSignals): TaskSignal {
  const steps = raw.subtasks.filter((s) => s.task_id === task.id);
  const done = steps.filter((s) => s.done);
  const files = raw.evidence.filter((e) => e.task_id === task.id);

  let lastAt: string | null = null;
  for (const s of done) lastAt = maxIso(lastAt, s.updated_at);
  for (const f of files) lastAt = maxIso(lastAt, f.created_at);
  for (const u of raw.updates) if (u.task_id === task.id) lastAt = maxIso(lastAt, u.created_at);

  const since = lastAt ?? task.start_at ?? task.created_at;
  const idleDays = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / DAY));

  let s = steps.length > 0 ? (done.length / steps.length) * 100 : Math.min(60, files.length * 20);
  if (files.length === 0 && steps.length > 0) s *= 0.85; // steps ticked, nothing to show for them
  if (idleDays >= 5) s *= 0.8;
  else if (idleDays >= 3) s *= 0.9;
  if (task.status === 'submitted') s = Math.max(s, 90);
  const signal = Math.max(0, Math.min(100, Math.round(s / 5) * 5));
  const reported = Math.max(0, Math.min(100, Math.round(task.progress)));

  return {
    task,
    reported,
    signal,
    gap: reported - signal,
    stepsDone: done.length,
    stepsTotal: steps.length,
    files: files.length,
    lastAt,
    idleDays,
  };
}

/** Average days late on the owner's closed tasks (null = no history). */
export function ownerLateness(ownerId: string | null, all: TaskWithPeople[]): number | null {
  if (!ownerId) return null;
  const closed = all.filter((t) => t.owner_id === ownerId && t.status === 'done' && t.due_at && t.closed_at);
  if (closed.length === 0) return null;
  const late = closed.map((t) => Math.max(0, (new Date(t.closed_at!).getTime() - new Date(t.due_at!).getTime()) / DAY));
  return late.reduce((a, b) => a + b, 0) / late.length;
}
