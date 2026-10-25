// How is it going? Saree3's colour, face and words follow live tasks (RLS-scoped, the same cached query and the same
// "late" rule as the Tasks page, so every number can be checked there):
//   employee → the tasks they own (+ a separate line for late tasks they gave others)
//   manager/admin → every task they can see (their team) (+ who on the team is overloaded)
// Each status names the tasks behind it and says the one thing that would make Saree3 happier (the cheer line).
import { useMemo } from 'react';
import type { Href } from 'expo-router';
import { useMyProfile, useTasks, useTeam, type TaskWithPeople } from '@/lib/api';
import { isLate } from '@/features/tasks/model';
import type { MuntiMood, MuntiTone } from './Munti';
import type { MuntiKey } from './tips';

/** great = on fire, good, watch = some late / due soon, behind = 3+ late, overloaded = more open work than hours, quiet = nothing */
export type PerfStatus = 'great' | 'good' | 'watch' | 'behind' | 'overloaded' | 'quiet';

export type Line = { key: MuntiKey; vars: Record<string, string | number> };

export type Performance = {
  status: PerfStatus;
  mood: MuntiMood;
  tone: MuntiTone;
  /** the main line, naming the tasks */
  message: Line;
  /** a second fact: late tasks you gave others (employee) / an overloaded person (manager) */
  extra: Line | null;
  /** the one thing that would cheer Saree3 up */
  cheer: Line;
  /** "Show me" → the Tasks page showing exactly these tasks ([] = no task list to show) */
  showIds: string[];
  showMe: Href | null;
};

const DAY = 86_400_000;
const DEFAULT_TASK_HOURS = 4;

export const MOOD: Record<PerfStatus, MuntiMood> = {
  great: 'star',
  good: 'wave',
  watch: 'oops',
  behind: 'sad',
  overloaded: 'dizzy',
  quiet: 'sleep',
};
export const TONE: Record<PerfStatus, MuntiTone> = {
  great: 'gold',
  good: 'green',
  watch: 'amber',
  behind: 'red',
  overloaded: 'purple',
  quiet: 'grey',
};
/** worse → better, for "did it improve?" */
export const RANK: Record<PerfStatus, number> = { behind: 0, overloaded: 1, watch: 2, quiet: 3, good: 4, great: 5 };

const finished = (x: { status: string }) => x.status === 'done' || x.status === 'submitted';

function statusOf(late: number, soon: number, overloaded: boolean, open: number, done: number): PerfStatus {
  if (late >= 3) return 'behind';
  if (overloaded) return 'overloaded';
  if (late > 0 || soon >= 3) return 'watch';
  if (open === 0 && done === 0) return 'quiet';
  return done >= 3 ? 'great' : 'good';
}

export function usePerformance(lang: 'en' | 'ar'): Performance | null {
  const me = useMyProfile();
  const tasks = useTasks();
  const team = useTeam();

  return useMemo(() => {
    if (!me.data || !tasks.data) return null;
    const meId = me.data.id;
    const employee = me.data.role === 'employee';
    const now = Date.now();
    const ar = lang === 'ar';
    const people = team.data ?? [];
    const first = (id: string | null) => {
      const p = id ? people.find((x) => x.id === id) : undefined;
      return p ? ((ar && p.full_name_ar) || p.full_name).split(' ')[0] : '';
    };
    // «Title» · «Title» (+2) — and the owner's name for team tasks
    const list = (xs: TaskWithPeople[], withOwner: boolean) => {
      // each item isolated (FSI…PDI): an English title inside an Arabic line keeps its own direction
      const shown = xs.slice(0, 2).map((x) => `⁨«${x.title}»${withOwner && x.owner_id ? ` (${first(x.owner_id)})` : ''}⁩`);
      const more = xs.length > 2 ? (ar ? ` و${xs.length - 2} غيرها` : ` +${xs.length - 2} more`) : '';
      return shown.join(ar ? ' و' : ' and ') + more;
    };
    const dueMs = (x: TaskWithPeople) => (x.due_at ? Date.parse(x.due_at) : Number.MAX_SAFE_INTEGER);
    const byDue = (a: TaskWithPeople, b: TaskWithPeople) => dueMs(a) - dueMs(b);

    const scope = employee ? tasks.data.filter((x) => x.owner_id === meId) : tasks.data;
    const open = scope.filter((x) => !finished(x) && x.status !== 'cancelled').sort(byDue);
    const late = open.filter((x) => isLate(x, now));
    const soon = open.filter((x) => x.due_at && Date.parse(x.due_at) >= now && Date.parse(x.due_at) - now < DAY);
    const done = scope.filter((x) => finished(x) && now - Date.parse(x.updated_at) < 7 * DAY).length;

    // overload: open hours (estimates, else ~4 h each) vs weekly hours
    const hoursOf = (xs: TaskWithPeople[]) => xs.reduce((s, x) => s + (x.estimate_hours ? Number(x.estimate_hours) : DEFAULT_TASK_HOURS), 0);
    let overloadedWho: { id: string; hours: number; cap: number } | null = null;
    if (employee) {
      const cap = Number(me.data.weekly_capacity_hours ?? 40);
      const h = hoursOf(open);
      if (cap > 0 && h > cap * 1.1) overloadedWho = { id: meId, hours: Math.round(h), cap: Math.round(cap) };
    } else {
      for (const p of people) {
        if (p.id === meId || p.status === 'deleted') continue;
        const cap = Number(p.weekly_capacity_hours ?? 40);
        const h = hoursOf(open.filter((x) => x.owner_id === p.id));
        if (cap > 0 && h > cap * 1.1 && (!overloadedWho || h / cap > overloadedWho.hours / overloadedWho.cap))
          overloadedWho = { id: p.id, hours: Math.round(h), cap: Math.round(cap) };
      }
    }
    // a manager's own status is about the team's tasks; an overloaded person is a separate line
    const selfOverloaded = employee && !!overloadedWho;
    const status = statusOf(late.length, soon.length, selfOverloaded, open.length, done);
    const who = employee ? 'emp' : 'mgr';
    const name = ((ar && me.data.full_name_ar) || me.data.full_name || '').split(' ')[0];
    const withOwner = !employee;

    // main line, naming the tasks
    let message: Line;
    let showIds: string[] = [];
    if (status === 'behind' || (status === 'watch' && late.length > 0)) {
      message = { key: `perf_late_${who}` as MuntiKey, vars: { name, count: late.length, list: list(late, withOwner) } };
      showIds = late.map((x) => x.id);
    } else if (status === 'watch') {
      message = { key: `perf_soon_${who}` as MuntiKey, vars: { name, count: soon.length, list: list(soon, withOwner) } };
      showIds = soon.map((x) => x.id);
    } else if (status === 'overloaded') {
      message = { key: 'perf_over_emp', vars: { name, hours: overloadedWho!.hours, cap: overloadedWho!.cap, count: open.length } };
      showIds = open.map((x) => x.id);
    } else {
      message = { key: `perf_${status}_${who}` as MuntiKey, vars: { name, done, open: open.length } };
    }

    // second fact
    let extra: Line | null = null;
    if (employee) {
      const gaveLate = tasks.data
        .filter((x) => x.assigner_id === meId && x.owner_id && x.owner_id !== meId && isLate(x, now))
        .sort(byDue);
      if (gaveLate.length) {
        extra = { key: 'deleg_late', vars: { count: gaveLate.length, list: list(gaveLate, true) } };
        // nothing of your own to show → "Show me" opens the late ones you gave others
        if (!showIds.length) showIds = gaveLate.map((x) => x.id);
      }
    } else if (overloadedWho) {
      extra = { key: 'perf_over_mgr', vars: { who: first(overloadedWho.id), hours: overloadedWho.hours, cap: overloadedWho.cap } };
    }

    // the one thing that would make Saree3 happier (and the colour it would turn)
    const colorKey = (s: PerfStatus) => `color_${TONE[s]}` as MuntiKey;
    let cheer: Line;
    const target = late[0] ?? soon[0] ?? open[0];
    if ((status === 'behind' || status === 'watch') && target) {
      const next = statusOf(Math.max(0, late.length - (late[0] ? 1 : 0)), Math.max(0, soon.length - (late[0] ? 0 : 1)), selfOverloaded, open.length - 1, done + 1);
      cheer = {
        key: employee ? 'cheer_finish' : 'cheer_team',
        vars: { title: target.title, who: first(target.owner_id), color: colorKey(next), emoji: next === 'great' ? '🔥' : next === 'good' ? '💚' : '🙂' },
      };
    } else if (status === 'overloaded' && open.length) {
      const last = open[open.length - 1];
      cheer = { key: 'cheer_over', vars: { title: last.title } };
    } else if (status === 'good') {
      cheer = { key: 'cheer_gold', vars: { count: Math.max(1, 3 - done) } };
    } else if (status === 'quiet') {
      cheer = { key: 'cheer_quiet', vars: {} };
    } else {
      cheer = { key: 'cheer_keep', vars: {} };
    }

    const showMe: Href | null = showIds.length ? { pathname: '/38-tasks', params: { ids: showIds.slice(0, 50).join(',') } } : null;
    return { status, mood: MOOD[status], tone: TONE[status], message, extra, cheer, showIds, showMe };
  }, [me.data, tasks.data, team.data, lang]);
}
