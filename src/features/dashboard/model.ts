// Screen 16 data: KPIs for the selected period vs the previous one, computed from live tasks / reviews / activity.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ActivityEntry, TaskWithPeople } from '@/lib/api';
import { MIN_PER_FOLLOWUP, MIN_PER_UPDATE } from '@/features/home/value';
import { closedAt, DAY_MS, isLateOpen, onTimeRate, startOfDay, startOfWeek, touchedIn } from './metrics';

export type Period = 'd' | 'w' | 'm';

export type ReviewLite = { rating: number | null; created_at: string; decided_at: string | null; submitted_by: string | null; task_id: string };

/** Rated reviews from the start of last month (enough for every period + its previous one). */
export function useRatedReviews() {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
  return useQuery({
    queryKey: ['reviews', 'rated', since],
    queryFn: async (): Promise<ReviewLite[]> => {
      const res = await supabase
        .from('reviews')
        .select('rating, created_at, decided_at, submitted_by, task_id')
        .not('rating', 'is', null)
        .gte('created_at', since);
      if (res.error) throw new Error(res.error.message);
      return (res.data ?? []) as ReviewLite[];
    },
  });
}

type Window = { from: number; to: number };

export function windows(p: Period, now = new Date()): { cur: Window; prev: Window } {
  const n = now.getTime() + 1;
  if (p === 'd') {
    const s = startOfDay(now).getTime();
    return { cur: { from: s, to: n }, prev: { from: s - DAY_MS, to: s } };
  }
  if (p === 'w') {
    const s = startOfWeek(now).getTime();
    return { cur: { from: s, to: n }, prev: { from: s - 7 * DAY_MS, to: s } };
  }
  const s = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const ps = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  return { cur: { from: s, to: n }, prev: { from: ps, to: s } };
}

export const BUCKET_KEYS: Record<Period, string[]> = {
  d: ['slots.h8', 'slots.h10', 'slots.h12', 'slots.h14', 'slots.h16'],
  w: ['days.sun', 'days.mon', 'days.tue', 'days.wed', 'days.thu'],
  m: ['weeks.w1', 'weeks.w2', 'weeks.w3', 'weeks.w4'],
};

/** Chart bucket for a completion time, or -1 when it falls outside the chart (e.g. Fri/Sat). */
function bucketOf(p: Period, ms: number) {
  const d = new Date(ms);
  if (p === 'd') return Math.max(0, Math.min(4, Math.floor((d.getHours() - 8) / 2)));
  if (p === 'w') return d.getDay() <= 4 ? d.getDay() : -1;
  return Math.min(3, Math.floor((d.getDate() - 1) / 7));
}

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function stats(tasks: TaskWithPeople[], reviews: ReviewLite[], activity: ActivityEntry[], w: Window, p: Period) {
  const closed = tasks.filter((t) => {
    const c = closedAt(t);
    return c !== null && c >= w.from && c < w.to;
  });
  const bars = BUCKET_KEYS[p].map(() => 0);
  for (const t of closed) {
    const b = bucketOf(p, closedAt(t)!);
    if (b >= 0) bars[b]++;
  }
  const rate = onTimeRate(tasks.filter((t) => touchedIn(t, w.from, w.to))).rate;
  const ratingVals = reviews
    .filter((r) => {
      const at = new Date(r.decided_at ?? r.created_at).getTime();
      return r.rating !== null && at >= w.from && at < w.to;
    })
    .map((r) => r.rating as number);
  const clarityVals = tasks
    .filter((t) => {
      const c = new Date(t.created_at).getTime();
      return t.clarity_score > 0 && c >= w.from && c < w.to;
    })
    .map((t) => t.clarity_score);
  let minutes = 0;
  for (const a of activity) {
    const at = new Date(a.created_at).getTime();
    if (at < w.from || at >= w.to) continue;
    if (a.action === 'followup_sent') minutes += MIN_PER_FOLLOWUP;
    else if (a.action === 'update_received' || a.action === 'submission_received') minutes += MIN_PER_UPDATE;
  }
  const lateOpen = tasks.filter((t) => touchedIn(t, w.from, w.to) && isLateOpen(t)).length;
  const byOwner = new Map<string, number>();
  for (const t of closed) if (t.owner_id) byOwner.set(t.owner_id, (byOwner.get(t.owner_id) ?? 0) + 1);
  let topOwner: { id: string; n: number } | null = null;
  for (const [id, n] of byOwner) if (!topOwner || n > topOwner.n) topOwner = { id, n };

  const r = avg(ratingVals);
  const c = avg(clarityVals);
  return {
    done: closed.length,
    onTime: rate,
    rating: r === null ? null : Math.round(r * 10) / 10,
    clarity: c === null ? null : Math.round(c),
    bars,
    hours: minutes / 60,
    late: lateOpen,
    topOwner,
  };
}

export type PeriodStats = ReturnType<typeof stats>;

export function computeDashboard(p: Period, tasks: TaskWithPeople[], reviews: ReviewLite[], activity: ActivityEntry[]) {
  const w = windows(p);
  const cur = stats(tasks, reviews, activity, w.cur, p);
  const prev = stats(tasks, reviews, activity, w.prev, p);
  const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
  return {
    cur,
    prev,
    delta: {
      done: prev.done > 0 ? Math.round(((cur.done - prev.done) / prev.done) * 100) : null,
      onTime: diff(cur.onTime, prev.onTime),
      rating: (() => {
        const d = diff(cur.rating, prev.rating);
        return d === null ? null : Math.round(d * 10) / 10;
      })(),
      clarity: diff(cur.clarity, prev.clarity),
    },
  };
}

/** Engagement numbers (points / kudos / streaks) are still demo — no points tables yet. Values from the design. */
export const ENGAGEMENT_DEMO: Record<Period, { pts: number; kudos: number; streaks: number }> = {
  d: { pts: 410, kudos: 4, streaks: 3 },
  w: { pts: 2340, kudos: 18, streaks: 3 },
  m: { pts: 9870, kudos: 61, streaks: 5 },
};
