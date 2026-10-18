// Load Radar (screen 11) — pure computations over live tasks + team, plus the design's sample team.
// Load this week = sum of estimate_hours of active tasks due in or before this week (overdue included),
// divided by profiles.weekly_capacity_hours.
import type { Profile, TaskWithPeople } from '@/lib/api';
import type { GradientToken } from '@/theme/tokens';
import { DAY_MS, isLateOpen, isOpen, startOfWeek } from '@/features/dashboard/metrics';
import { person } from '@/features/demo/team';

export type Band = 'ok' | 'near' | 'over';

/** green < 80%, amber 80–100%, red > 100% */
export function bandOf(pct: number): Band {
  return pct > 100 ? 'over' : pct >= 80 ? 'near' : 'ok';
}

export type Why = { kind: 'similar'; month: number } | { kind: 'skill'; skill: string } | { kind: 'free' };

export type RadarPerson = {
  id: string;
  name: string;
  nameAr: string;
  gradient?: GradientToken;
  capacity: number;
  /** hours already booked this week */
  load: number;
  overdue: number;
  /** soonest-due open task this week (what would slip) */
  topTask: string | null;
  skill: string | null;
  similarMonth: number | null;
  current: boolean;
};

export type RadarRow = RadarPerson & {
  nowPct: number;
  totalPct: number;
  free: number;
  score: number;
  recommended: boolean;
  why: Why | null;
};

// Words in a task title that point at a skill (seed skills in supabase/seed.sql).
const SKILL_HINTS: Record<string, string[]> = {
  marketing: ['marketing', 'campaign', 'competitor', 'brand', 'social', 'launch', 'ads'],
  research: ['research', 'competitor', 'survey', 'benchmark', 'interview', 'analysis'],
  content: ['content', 'copy', 'post', 'calendar', 'guide'],
  events: ['event', 'booth', 'workshop'],
  reporting: ['report', 'kpi', 'summary', 'dashboard'],
  finance: ['finance', 'budget', 'revenue', 'invoice', 'pricing', 'cost', 'numbers'],
  excel: ['sheet', 'excel', 'numbers'],
  sales: ['pitch', 'deal', 'proposal', 'tender', 'contract'],
  clients: ['client', 'customer', 'account'],
  presentations: ['deck', 'presentation', 'pitch'],
  product: ['product', 'requirements', 'prd', 'feature'],
  roadmaps: ['roadmap', 'plan'],
  backend: ['api', 'backend', 'migration', 'database', 'script'],
  mobile: ['mobile', 'app', 'ios', 'android'],
  integrations: ['integration', 'api', 'gosi', 'qiwa'],
  design: ['design', 'wireframe', 'figma', 'screens', 'redesign'],
  ux: ['ux', 'flow', 'onboarding', 'usability'],
};

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'into', 'plan', 'team']);

function words(title: string) {
  return title
    .toLowerCase()
    .split(/[^a-z0-9؀-ۿ]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

export function matchSkill(skills: string[], title: string): string | null {
  const ws = words(title);
  const lower = title.toLowerCase();
  for (const s of skills) {
    if (lower.includes(s.toLowerCase())) return s;
    const hints = SKILL_HINTS[s] ?? [];
    if (hints.some((h) => ws.some((w) => w.startsWith(h)))) return s;
  }
  return null;
}

/** Month (0–11) of the latest done task by this person that looks like the new one. */
function similarDoneMonth(done: TaskWithPeople[], title: string): number | null {
  const ws = new Set(words(title).map((w) => w.slice(0, 6)));
  if (ws.size === 0) return null;
  let best: number | null = null;
  for (const t of done) {
    if (!words(t.title).some((w) => ws.has(w.slice(0, 6)))) continue;
    const at = new Date(t.closed_at ?? t.updated_at).getTime();
    if (best === null || at > best) best = at;
  }
  return best === null ? null : new Date(best).getMonth();
}

export function livePeople(
  team: Profile[],
  tasks: TaskWithPeople[],
  newTitle: string,
  opts: { excludeTaskId?: string; currentOwnerId?: string | null } = {},
  now = Date.now(),
): RadarPerson[] {
  const weekEnd = startOfWeek(new Date(now)).getTime() + 7 * DAY_MS;
  return team
    .filter((p) => p.role === 'employee')
    .map((p) => {
      const mine = tasks.filter((t) => t.owner_id === p.id && t.id !== opts.excludeTaskId);
      const open = mine.filter(isOpen);
      const week = open.filter((t) => !!t.due_at && new Date(t.due_at).getTime() < weekEnd);
      const load = week.reduce((s, t) => s + (t.estimate_hours ?? 0), 0);
      const upcoming = week
        .filter((t) => new Date(t.due_at!).getTime() >= now)
        .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
      return {
        id: p.id,
        name: p.full_name,
        nameAr: p.full_name_ar ?? p.full_name,
        capacity: p.weekly_capacity_hours > 0 ? p.weekly_capacity_hours : 40,
        load,
        overdue: open.filter((t) => isLateOpen(t, now)).length,
        topTask: upcoming[0]?.title ?? week[0]?.title ?? null,
        skill: matchSkill(p.skills ?? [], newTitle),
        similarMonth: similarDoneMonth(mine.filter((t) => t.status === 'done'), newTitle),
        current: !!opts.currentOwnerId && opts.currentOwnerId === p.id,
      };
    });
}

/** The design's four people (LoadRadar.dc.html): Faisal 115%, Abdullah 95%, Noura 60%, Khalid 80% + 1 overdue. */
export function samplePeople(topTask: { spl: string; q3: string }): RadarPerson[] {
  const mk = (id: string, pct: number, extra: Partial<RadarPerson>): RadarPerson => {
    const d = person(id);
    return {
      id: `sample-${id}`, name: d.name, nameAr: d.nameAr, gradient: d.gradient, capacity: 40, load: (pct / 100) * 40,
      overdue: 0, topTask: null, skill: null, similarMonth: null, current: false, ...extra,
    };
  };
  return [
    mk('faisal', 115, { topTask: topTask.spl }),
    mk('abdullah', 95, { topTask: topTask.q3 }),
    mk('noura', 60, { skill: 'marketing', similarMonth: 4 }),
    mk('khalid', 80, { overdue: 1 }),
  ];
}

/** Adds percentages, scores and the recommendation; recommended person first, then lightest load. */
export function rank(people: RadarPerson[], hours: number): RadarRow[] {
  const rows = people.map((p) => {
    const nowPct = Math.round((p.load / p.capacity) * 100);
    // the task being assigned is excluded from `load`, so everyone (current owner too) carries it on top
    const totalPct = Math.round(((p.load + hours) / p.capacity) * 100);
    const free = Math.max(0, Math.round(p.capacity - p.load));
    const score = p.capacity - p.load - hours + (p.skill ? 6 : 0) + (p.similarMonth !== null ? 6 : 0) - p.overdue * 15;
    return { ...p, nowPct, totalPct, free, score, recommended: false, why: null as Why | null };
  });
  if (rows.length === 0) return rows;
  const best = rows.reduce((a, b) => (b.score > a.score ? b : a));
  best.recommended = true;
  best.why =
    best.similarMonth !== null
      ? { kind: 'similar', month: best.similarMonth }
      : best.skill
        ? { kind: 'skill', skill: best.skill }
        : { kind: 'free' };
  return [best, ...rows.filter((r) => r !== best).sort((a, b) => a.nowPct - b.nowPct)];
}

/** Bars are drawn on a 0–140% scale like the design. */
export const BAR_SCALE = 140;
