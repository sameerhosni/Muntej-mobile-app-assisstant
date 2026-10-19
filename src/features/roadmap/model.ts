// Roadmap (screen 24) — everything computed from tasks; nobody drags bars.
// Forecast rule (local): delay if expected_close_at > due_at; at risk if progress trails the time elapsed
// by more than 20 points; otherwise on track. Projects = workspaces; span = min start .. max expected close.
import type { TaskWithPeople } from '@/lib/api';
import { colors } from '@/theme/tokens';
import { DAY_MS, startOfDay } from '@/features/dashboard/metrics';

export type Forecast = 'on_track' | 'at_risk' | 'delay';

export const WINDOW_DAYS = 56; // 8 weeks

export type Suggestion =
  | { kind: 'move_due'; taskId: string; task: string; date: number; days: number; patch: { due_at: string }; prev: { due_at: string | null; expected_close_at: string | null }; hours: number | null }
  | { kind: 'set_forecast'; taskId: string; task: string; date: number; behind: number; patch: { expected_close_at: string }; prev: { due_at: string | null; expected_close_at: string | null }; hours: number | null }
  | { kind: 'demo'; tip: string; gain: string };

export type RoadRow = {
  id: string;
  name: string;
  /** workspace dot color (data from workspaces.color, or a token for samples) */
  dot: string;
  start: number;
  due: number;
  expected: number;
  progress: number;
  forecast: Forecast;
  lateDays: number;
  behind: number;
  suggestion: Suggestion | null;
  /** child task rows (projects only) */
  children: RoadRow[];
};

/** Window starts one day before today so the today line sits just inside the left (right in Arabic) edge. */
export function windowStart(now = Date.now()) {
  return startOfDay(new Date(now)).getTime() - DAY_MS;
}

export function frac(ms: number, w0: number) {
  return Math.max(0, Math.min(1, (ms - w0) / (WINDOW_DAYS * DAY_MS)));
}

export function fmtDate(ms: number, months: string, pattern: (m: string, d: number) => string) {
  const d = new Date(ms);
  return pattern(months.split(',')[d.getMonth()] ?? '', d.getDate());
}

function forecastOf(start: number, due: number, expected: number, progress: number, done: boolean, now: number) {
  if (done) return { forecast: 'on_track' as Forecast, lateDays: 0, behind: 0 };
  const lateDays = expected > due + DAY_MS / 2 ? Math.ceil((expected - due) / DAY_MS) : 0;
  const span = Math.max(DAY_MS, due - start);
  const elapsed = Math.max(0, Math.min(1, (now - start) / span)) * 100;
  const behind = Math.round(elapsed - progress);
  if (lateDays > 0) return { forecast: 'delay' as Forecast, lateDays, behind };
  if (behind > 20) return { forecast: 'at_risk' as Forecast, lateDays: 0, behind };
  return { forecast: 'on_track' as Forecast, lateDays: 0, behind };
}

/** Where a task really lands at its current pace (for "set expected finish"). */
function projectedEnd(start: number, due: number, progress: number, now: number) {
  const span = Math.max(DAY_MS, due - start);
  const elapsedFrac = Math.max(0, (now - start) / span);
  const pace = Math.max(progress, 1) / 100; // share done
  const ratio = Math.min(2, elapsedFrac / pace); // total time needed, as a multiple of the plan (capped at 2×)
  const end = start + span * Math.max(1, ratio);
  return Math.max(end, due + DAY_MS);
}

function taskRow(t: TaskWithPeople, dot: string, now: number): RoadRow {
  const start = new Date(t.start_at!).getTime();
  const due = new Date(t.due_at ?? t.expected_close_at!).getTime();
  const expected = new Date(t.expected_close_at ?? t.due_at!).getTime();
  const f = forecastOf(start, due, expected, t.progress, t.status === 'done', now);
  const prev = { due_at: t.due_at, expected_close_at: t.expected_close_at };
  let suggestion: Suggestion | null = null;
  if (f.forecast === 'delay') {
    suggestion = {
      kind: 'move_due', taskId: t.id, task: t.title, date: expected, days: f.lateDays,
      patch: { due_at: new Date(expected).toISOString() }, prev, hours: t.estimate_hours,
    };
  } else if (f.forecast === 'at_risk') {
    const end = projectedEnd(start, due, t.progress, now);
    suggestion = {
      kind: 'set_forecast', taskId: t.id, task: t.title, date: end, behind: f.behind,
      patch: { expected_close_at: new Date(end).toISOString() }, prev, hours: t.estimate_hours,
    };
  }
  return { id: t.id, name: t.title, dot, start, due, expected, progress: t.progress, ...f, suggestion, children: [] };
}

/** Live rows: one per workspace (plus "other" for tasks without one), each holding its task rows. */
export function liveProjects(tasks: TaskWithPeople[], lang: string, otherName: string, now = Date.now()): RoadRow[] {
  const w0 = windowStart(now);
  const w1 = w0 + WINDOW_DAYS * DAY_MS;
  const usable = tasks.filter((t) => {
    if (t.status === 'cancelled' || t.status === 'draft') return false;
    if (!t.start_at || !(t.due_at || t.expected_close_at)) return false;
    const s = new Date(t.start_at).getTime();
    const e = Math.max(new Date(t.due_at ?? t.expected_close_at!).getTime(), new Date(t.expected_close_at ?? t.due_at!).getTime());
    return e >= w0 && s <= w1;
  });
  const groups = new Map<string, { name: string; dot: string; tasks: TaskWithPeople[] }>();
  for (const t of usable) {
    const key = t.workspace?.id ?? 'none';
    if (!groups.has(key)) {
      groups.set(key, {
        name: t.workspace ? (lang === 'ar' && t.workspace.name_ar ? t.workspace.name_ar : t.workspace.name) : otherName,
        dot: t.workspace?.color ?? colors.textFaint,
        tasks: [],
      });
    }
    groups.get(key)!.tasks.push(t);
  }
  const rows: RoadRow[] = [];
  for (const [key, g] of groups) {
    const children = g.tasks.map((t) => taskRow(t, g.dot, now)).sort((a, b) => a.start - b.start);
    const start = Math.min(...children.map((c) => c.start));
    const due = Math.max(...children.map((c) => c.due));
    const expected = Math.max(...children.map((c) => c.expected));
    let wsum = 0;
    let psum = 0;
    for (const t of g.tasks) {
      const w = t.estimate_hours ?? 1;
      wsum += w;
      psum += w * t.progress;
    }
    const progress = wsum > 0 ? Math.round(psum / wsum) : 0;
    const allDone = g.tasks.every((t) => t.status === 'done');
    let f = forecastOf(start, due, expected, progress, allDone, now);
    // a late or slipping task makes the project at least "at risk"
    if (f.forecast === 'on_track' && children.some((c) => c.forecast !== 'on_track')) f = { ...f, forecast: 'at_risk' };
    const worst =
      [...children].filter((c) => c.forecast === 'delay').sort((a, b) => b.lateDays - a.lateDays)[0] ??
      [...children].filter((c) => c.forecast === 'at_risk').sort((a, b) => b.behind - a.behind)[0];
    rows.push({ id: `ws-${key}`, name: g.name, dot: g.dot, start, due, expected, progress, ...f, suggestion: worst?.suggestion ?? null, children });
  }
  return rows.sort((a, b) => a.start - b.start);
}

type DemoStrings = Record<'spl' | 'nt' | 'beta' | 'qiwa' | 'woj' | 'wal' | 'tipNt' | 'tipQiwa' | 'tipWal' | 'gainDay' | 'gainQiwa' | 'qiwaTasks' | 'tasks', string>;

/** The design's six projects (ProjectRoadmap.dc.html), positioned in % of the 8-week window. */
export function sampleProjects(s: DemoStrings, fixed: Record<string, boolean>, now = Date.now()): RoadRow[] {
  const w0 = windowStart(now);
  const at = (pc: number) => w0 + Math.round(pc * 0.56) * DAY_MS;
  const P = [
    { id: 'spl', name: s.spl, dot: colors.primary, s: 0, e: 8, done: 70, delay: 0, risk: false },
    { id: 'nt', name: s.nt, dot: colors.primary, s: 4, e: 46, done: 35, delay: 0, risk: true, tip: s.tipNt, gain: s.gainDay },
    { id: 'beta', name: s.beta, dot: colors.green, s: 8, e: 60, done: 42, delay: 0, risk: false },
    { id: 'qiwa', name: s.qiwa, dot: colors.green, s: 22, e: 78, done: 18, delay: 14, risk: false, tip: s.tipQiwa, gain: s.gainQiwa },
    { id: 'woj', name: s.woj, dot: colors.purple, s: 40, e: 92, done: 5, delay: 0, risk: false },
    { id: 'wal', name: s.wal, dot: colors.orange, s: 30, e: 100, done: 0, delay: 0, risk: true, tip: s.tipWal, gain: s.gainDay },
  ];
  return P.map((p) => {
    const ok = !!fixed[p.id];
    const delay = ok ? 0 : Math.min(p.delay, 100 - p.e);
    const forecast: Forecast = ok ? 'on_track' : delay ? 'delay' : p.risk ? 'at_risk' : 'on_track';
    const names = (p.id === 'qiwa' ? s.qiwaTasks : s.tasks).split(',');
    const span = (p.e - p.s) / names.length;
    const children: RoadRow[] = names.map((n, i) => {
      const cs = p.s + span * i;
      const d = p.id === 'qiwa' && i === 1 && !ok ? 10 : 0;
      return {
        id: `${p.id}-${i}`, name: n, dot: p.dot, start: at(cs), due: at(cs + span), expected: at(cs + span + d),
        progress: i === 0 ? 100 : i === 1 && p.done > 20 ? 50 : 0, forecast: d ? 'delay' : 'on_track',
        lateDays: Math.round(d * 0.56), behind: 0, suggestion: null, children: [],
      };
    });
    return {
      id: p.id, name: p.name, dot: p.dot, start: at(p.s), due: at(p.e), expected: at(p.e + delay), progress: p.done,
      forecast, lateDays: Math.round(delay * 0.56), behind: 0,
      suggestion: p.tip && !ok ? { kind: 'demo', tip: p.tip, gain: p.gain! } : null,
      children,
    };
  });
}

/** Filter chips on screen 24: by each row's forecast ('late' = forecast delay). */
export type RoadFilter = 'all' | 'late' | 'atRisk' | 'onTrack';
export const ROAD_FILTERS: RoadFilter[] = ['all', 'late', 'atRisk', 'onTrack'];
const FILTER_FORECAST: Record<Exclude<RoadFilter, 'all'>, Forecast> = { late: 'delay', atRisk: 'at_risk', onTrack: 'on_track' };

export function matchesRoadFilter(r: RoadRow, f: RoadFilter): boolean {
  return f === 'all' || r.forecast === FILTER_FORECAST[f];
}
