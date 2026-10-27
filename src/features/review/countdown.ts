// The review clock: reviews.auto_approve_at (2 working days after it was sent by default, 3 at most — see
// supabase/migrations/20261021190000_review_countdown.sql). At that moment Muntej approves the work by itself.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ColorToken } from '@/theme/tokens';
import type { Review } from '@/lib/api';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** the open review round of a task, if any */
export function openReview(reviews: Review[] | undefined): Review | null {
  return [...(reviews ?? [])].filter((r) => !r.decision).sort((a, b) => b.round - a.round)[0] ?? null;
}

/** when Muntej approves it by itself (column added after the generated types) */
export function autoApproveAt(r: Review | null): string | null {
  return (r as (Review & { auto_approve_at?: string | null }) | null)?.auto_approve_at ?? null;
}

/** re-renders every minute so the clock stays true */
export function useNow(every = MIN) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}

export type Countdown = { d: number; h: number; m: number; left: number; tone: ColorToken; tint: ColorToken; due: boolean };

/** time left until `iso`: blue with more than a day, amber in the last day, red in the last 6 hours */
export function countdown(iso: string, now: number): Countdown {
  const left = Math.max(0, Date.parse(iso) - now);
  const d = Math.floor(left / DAY);
  const h = Math.floor((left % DAY) / HOUR);
  const m = Math.floor((left % HOUR) / MIN);
  const tone: ColorToken = left > DAY ? 'primary' : left > 6 * HOUR ? 'amberStrong' : 'red';
  const tint: ColorToken = left > DAY ? 'primaryTint' : left > 6 * HOUR ? 'amberTint' : 'redTint';
  return { d, h, m, left, tone, tint, due: left === 0 };
}

/** "1d 6h" / "5h 20m" / "20m" (string keys: dh, hm, m in the caller's namespace) */
export function leftText(c: Countdown, t: (k: string, o?: Record<string, unknown>) => string) {
  if (c.d > 0) return t('left_dh', { d: c.d, h: c.h });
  if (c.h > 0) return t('left_hm', { h: c.h, m: c.m });
  return t('left_m', { m: Math.max(1, c.m) });
}

/** task id → when Muntej approves its open review by itself (for lists that don't load reviews) */
export function useReviewDeadlines(taskIds: string[]) {
  const ids = [...taskIds].sort();
  return useQuery({
    queryKey: ['reviewDeadlines', ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      // auto_approve_at isn't in the generated types yet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('reviews')
        .select('task_id, auto_approve_at')
        .in('task_id', ids)
        .is('decision', null);
      if (error) throw new Error(error.message);
      const m = new Map<string, string>();
      for (const r of (data ?? []) as { task_id: string; auto_approve_at: string | null }[]) if (r.auto_approve_at) m.set(r.task_id, r.auto_approve_at);
      return m;
    },
  });
}

/** What Saree3's proof check found missing on work waiting for review (task id → short items), so Home can say it
 *  without opening the task. Only checks that didn't pass, on the latest round, and only where proof was asked for
 *  (owner, 27 Oct: proof is optional unless the manager asks, so an optional one is never nagged about). */
export function useProofGaps(taskIds: string[]) {
  const ids = [...taskIds].sort();
  return useQuery({
    queryKey: ['proofGaps', ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, string[]>> => {
      // ai_check isn't in the generated types yet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('reviews')
        .select('task_id, ai_check, tasks!inner(proof_required)')
        .in('task_id', ids)
        .neq('tasks.proof_required', 'none')
        .is('decision', null)
        .order('created_at');
      if (error) throw new Error(error.message);
      const m = new Map<string, string[]>();
      // oldest first, so a later round replaces (or clears) an earlier one
      for (const r of (data ?? []) as { task_id: string; ai_check: { verdict?: string; missing?: string[] } | null }[]) {
        const c = r.ai_check;
        if (c && c.verdict !== 'pass' && c.missing?.length) m.set(r.task_id, c.missing);
        else m.delete(r.task_id);
      }
      return m;
    },
  });
}
