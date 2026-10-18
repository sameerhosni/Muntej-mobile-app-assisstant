// Screen 32 data: counts what Muntej did this week/month from activity_log (live), with demo fallback.
import { useMemo } from 'react';
import { useActivity, useHomeStats, useMyProfile, useTeam, type ActivityEntry } from '@/lib/api';
import { MIN_PER_FOLLOWUP, MIN_PER_UPDATE } from '@/features/home/value';

export type Period = 'week' | 'month';

export type ReceiptCounts = {
  followups: number;
  updates: number;
  promises: number;
  decisions: number;
  chases: number;
};

/** Design demo numbers (Receipt.dc.html), used only when there is no activity for the period. */
const DEMO: Record<Period, ReceiptCounts & { hours: number }> = {
  week: { followups: 124, updates: 58, promises: 11, decisions: 9, chases: 0, hours: 6.2 },
  month: { followups: 512, updates: 241, promises: 46, decisions: 37, chases: 2, hours: 25.8 },
};

/** Saudi work week starts Sunday. */
export function periodStart(period: Period, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), period === 'month' ? 1 : now.getDate());
  if (period === 'week') d.setDate(d.getDate() - d.getDay());
  return d;
}

function bucket(a: ActivityEntry): keyof ReceiptCounts | null {
  const act = a.action;
  if (act === 'followup_sent') return 'followups';
  if (act === 'update_received' || act === 'submission_received') return 'updates';
  if (act.includes('promise')) return 'promises';
  if (act.startsWith('decision_') || act === 'escalated') return 'decisions';
  if (act === 'manager_asked') return 'chases';
  return null;
}

export function useReceipt(period: Period, rate: number) {
  const activity = useActivity(200);
  const stats = useHomeStats();
  const me = useMyProfile();
  const team = useTeam();

  const result = useMemo(() => {
    const start = periodStart(period);
    const counts: ReceiptCounts = { followups: 0, updates: 0, promises: 0, decisions: 0, chases: 0 };
    for (const a of activity.data ?? []) {
      if (new Date(a.created_at) < start) continue;
      const b = bucket(a);
      if (b) counts[b] += 1;
    }
    // The followups table is the source of truth for sent follow-ups; the pilot is younger than a month,
    // so its totals stand in for the month view when the activity log has fewer entries.
    if (period === 'month' && stats.data) {
      counts.followups = Math.max(counts.followups, stats.data.followupsSent);
      counts.updates = Math.max(counts.updates, stats.data.updatesReceived);
      counts.chases = Math.max(counts.chases, stats.data.timesAsked);
    }
    // Live as soon as the workspace has any activity at all (then zeros are real zeros).
    const live = (activity.data?.length ?? 0) > 0 || (stats.data?.followupsSent ?? 0) > 0;
    if (!live) {
      const d = DEMO[period];
      return { counts: d as ReceiptCounts, hours: d.hours, sar: Math.round(d.hours * rate), live: false };
    }
    const hours = (counts.followups * MIN_PER_FOLLOWUP + counts.updates * MIN_PER_UPDATE) / 60;
    return { counts, hours, sar: Math.round(hours * rate), live: true };
  }, [activity.data, stats.data, period, rate]);

  const fullName = me.data?.full_name ?? null;
  return {
    ...result,
    loading: activity.isLoading,
    managerName: fullName ? fullName.split(' ')[0] : null,
    managerNameAr: me.data?.full_name_ar ? me.data.full_name_ar.split(' ')[0] : null,
    teamSize: team.data?.length || null,
  };
}
