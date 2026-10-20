// How is it going? Munti's face and message follow live tasks (RLS-scoped, same cached query as the Tasks list):
// an employee looks at their own tasks, a manager/admin at every task they can see (their team).
import { useMemo } from 'react';
import { useMyProfile, useTasks } from '@/lib/api';
import { isLate } from '@/features/tasks/model';
import type { MuntiMood } from './Munti';
import type { MuntiKey } from './tips';

export type PerfStatus = 'great' | 'good' | 'watch' | 'behind' | 'quiet';

export type Performance = {
  status: PerfStatus;
  mood: MuntiMood;
  /** message key + its values, e.g. perf_great_emp + { name, done } */
  message: MuntiKey;
  vars: Record<string, string | number>;
  /** "Show me" opens the late tasks */
  showLate: boolean;
};

const DAY = 86_400_000;

const MOOD: Record<PerfStatus, MuntiMood> = { great: 'star', good: 'wave', watch: 'oops', behind: 'sad', quiet: 'sleep' };

export function usePerformance(lang: 'en' | 'ar'): Performance | null {
  const me = useMyProfile();
  const tasks = useTasks();

  return useMemo(() => {
    if (!me.data || !tasks.data) return null;
    const employee = me.data.role === 'employee';
    const mine = employee ? tasks.data.filter((x) => x.owner_id === me.data!.id) : tasks.data;
    const now = Date.now();
    // handed in for review = finished as far as the owner is concerned
    const finished = (x: { status: string }) => x.status === 'done' || x.status === 'submitted';
    const open = mine.filter((x) => !finished(x) && x.status !== 'cancelled');
    const late = open.filter((x) => isLate(x, now)).length;
    const soon = open.filter((x) => {
      if (!x.due_at) return false;
      const due = new Date(x.due_at).getTime();
      return due >= now && due - now < DAY;
    }).length;
    const done = mine.filter((x) => finished(x) && now - new Date(x.updated_at).getTime() < 7 * DAY).length;

    const status: PerfStatus =
      late >= 3 ? 'behind' : late > 0 || soon >= 3 ? 'watch' : open.length === 0 && done === 0 ? 'quiet' : done >= 3 ? 'great' : 'good';
    const full = (lang === 'ar' && me.data.full_name_ar) || me.data.full_name || '';
    const who = employee ? 'emp' : 'mgr';
    return {
      status,
      mood: MOOD[status],
      message: `perf_${status === 'watch' && late === 0 ? 'soon' : status}_${who}` as MuntiKey,
      vars: { name: full.split(' ')[0], late, soon, done, open: open.length },
      showLate: late > 0,
    };
  }, [me.data, tasks.data, lang]);
}
