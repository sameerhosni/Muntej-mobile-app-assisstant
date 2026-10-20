// One tap to finish a task (Tasks page rows, Latest tasks, Employee Home checklist) — and one more to reopen it.
// set_task_status decides: assigned by someone else → it goes to them for review (submitted); self-assigned,
// or you're the assigner / their manager → done. Points go to the (demo) wallet; Munti cheers with the value.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import i18n from '@/lib/i18n';
import { useDirection } from '@/lib/i18n';
import { useMyProfile, useTeam, type TaskPriority, type TaskWithPeople } from '@/lib/api';
import { invalidateTaskData, setTaskStatus } from '@/features/chat/api';
import { MIN_PER_FOLLOWUP, formatNumber } from '@/features/home/value';
import { wallet } from '@/features/rewards/wallet';
import { munti } from '@/features/munti/store';
import { MUNTI_NS } from '@/features/munti/tips';

export const TASK_POINTS: Record<TaskPriority, number> = { urgent: 70, high: 40, medium: 15, low: 5 };

type Tickable = Pick<TaskWithPeople, 'id' | 'title' | 'status' | 'priority' | 'assigner_id' | 'owner_id'>;

export const isFinished = (status: string) => status === 'done' || status === 'submitted';

export function useCompleteTask() {
  const qc = useQueryClient();
  const me = useMyProfile();
  const team = useTeam();
  const { lang } = useDirection();
  const [busyId, setBusyId] = useState<string | null>(null);
  const tm = (key: string, vars?: Record<string, unknown>) => i18n.t(`${MUNTI_NS}.${key}`, vars);

  const nameOf = (id: string | null | undefined) => {
    const p = id ? (team.data ?? []).find((x) => x.id === id) : null;
    return p ? ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0] : null;
  };

  /** Can this person tick it? (the server re-checks) */
  const canTick = (x: Tickable) =>
    x.status !== 'cancelled' &&
    !!me.data &&
    (x.owner_id === me.data.id || x.assigner_id === me.data.id || me.data.role !== 'employee');

  const toggle = async (x: Tickable): Promise<boolean> => {
    const finished = isFinished(x.status);
    const key = `task:${x.id}`;
    const pts = TASK_POINTS[x.priority] ?? 15;
    setBusyId(x.id);
    try {
      const result = await setTaskStatus(x.id, finished ? 'reopen' : 'done');
      if (finished) {
        wallet.unearn(key);
        munti.say(tm('complete_reopen', { title: x.title }), 'think');
      } else {
        // points only for your own work; a manager closing someone's task just gets the value line
        if (x.owner_id === me.data?.id) wallet.earn(key, pts);
        const reviewer = nameOf(x.assigner_id !== me.data?.id ? x.assigner_id : me.data?.manager_id);
        munti.celebrate(
          result === 'submitted'
            ? tm('complete_sent', { title: x.title, name: reviewer ?? '…', pts: formatNumber(pts, lang) })
            : x.owner_id === me.data?.id
              ? tm('complete_done', { title: x.title, pts: formatNumber(pts, lang), min: formatNumber(MIN_PER_FOLLOWUP * 2, lang) })
              : tm('complete_closed', { title: x.title, name: nameOf(x.owner_id) ?? '…' }),
        );
      }
      await invalidateTaskData(qc);
      return true;
    } catch (e) {
      munti.say(tm('complete_failed', { reason: (e as Error).message }), 'oops');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  return { toggle, canTick, busyId };
}
