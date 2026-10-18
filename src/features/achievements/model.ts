// Screen 21 view model: windows (week / month / quarter), dots and lanes for live rows and the design's sample.
import type { Profile } from '@/lib/api';
import { DAY_MS, firstName, personName, startOfWeek } from '@/features/dashboard/metrics';
import { wsTone, type WsTone } from '@/features/workspaces/color';
import { workspaceName, type WorkspaceWithMembers } from '@/features/workspaces/useWorkspaces';
import type { AchievementRow } from './useAchievements';
import { DEMO, DEMO_PEOPLE, DEMO_WS } from './demo';

export type Zoom = 'w' | 'm' | 'q';
export type View = 'ws' | 'emp';

export type Dot = {
  id: string;
  laneWs: string;
  lanePerson: string;
  title: string;
  who: string;
  wsName: string;
  tone: WsTone;
  /** 0–100 along the lane, from the start edge. */
  pos: number;
  at: number;
  dateLabel: string;
  rating: number | null;
  proofs: number;
  taskId: string | null;
};

export type Lane = { key: string; name: string; tone: WsTone; isPerson: boolean; dots: Dot[] };

export type TimelineVM = {
  sample: boolean;
  count: number;
  delta: { up: boolean; n: number; kind: 'abs' | 'pct'; prevMonth?: number } | null;
  axis: string[];
  dots: Dot[];
  legend: { name: string; tone: WsTone }[];
  wsLanes: Lane[];
  personLanes: Lane[];
};

type T = (key: string, opts?: Record<string, unknown>) => string;

const NO_WS = '__none';

function locale(lang: string) {
  return lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US';
}

export function fmtDate(d: Date, lang: string) {
  return new Intl.DateTimeFormat(locale(lang), { month: 'short', day: 'numeric' }).format(d);
}

function monthName(m: number, lang: string, year = new Date().getFullYear()) {
  return new Intl.DateTimeFormat(locale(lang), { month: 'short' }).format(new Date(year, m, 1));
}

function weekdayName(d: Date, lang: string) {
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'short' }).format(d);
}

export function windowFor(z: Zoom, now = new Date()) {
  if (z === 'w') {
    const from = startOfWeek(now).getTime();
    return { from, to: from + 7 * DAY_MS, prevFrom: from - 7 * DAY_MS };
  }
  const back = z === 'm' ? 0 : 2;
  const span = z === 'm' ? 1 : 3;
  const from = new Date(now.getFullYear(), now.getMonth() - back, 1).getTime();
  const to = new Date(now.getFullYear(), now.getMonth() - back + span, 1).getTime();
  const prevFrom = new Date(now.getFullYear(), now.getMonth() - back - span, 1).getTime();
  return { from, to, prevFrom };
}

function axisFor(z: Zoom, t: T, lang: string, now = new Date()): string[] {
  const { from } = windowFor(z, now);
  if (z === 'w') return [0, 2, 4].map((d) => weekdayName(new Date(from + d * DAY_MS), lang));
  if (z === 'm') return [1, 2, 3, 4].map((n) => t('weekN', { n }));
  const start = new Date(from);
  return [0, 1, 2].map((i) => monthName(start.getMonth() + i, lang, start.getFullYear()));
}

const clampPos = (p: number) => Math.max(4, Math.min(96, p));

export function buildLive(
  z: Zoom,
  rows: AchievementRow[],
  workspaces: WorkspaceWithMembers[],
  team: Profile[],
  ctx: { t: T; lang: string; now?: Date },
): TimelineVM {
  const { t, lang } = ctx;
  const now = ctx.now ?? new Date();
  const { from, to, prevFrom } = windowFor(z, now);
  const wsIndex = new Map(workspaces.map((w, i) => [w.id, i]));
  const toneOf = (wsId: string | null) => {
    const i = wsId ? wsIndex.get(wsId) : undefined;
    return i === undefined ? wsTone(null, workspaces.length) : wsTone(workspaces[i].color, i);
  };
  const wsNameOf = (wsId: string | null) => {
    const i = wsId ? wsIndex.get(wsId) : undefined;
    return i === undefined ? t('noWorkspace') : workspaceName(workspaces[i], lang);
  };
  const whoOf = (id: string) => {
    const p = team.find((x) => x.id === id);
    return p ? firstName(personName(p, lang)) : t('someone');
  };

  const inWin = rows.filter((r) => {
    const at = new Date(r.achieved_at).getTime();
    return at >= from && at < to;
  });
  const prevCount = rows.filter((r) => {
    const at = new Date(r.achieved_at).getTime();
    return at >= prevFrom && at < from;
  }).length;

  const dots: Dot[] = inWin.map((r) => {
    const at = new Date(r.achieved_at).getTime();
    return {
      id: r.id,
      laneWs: r.workspace_id ?? NO_WS,
      lanePerson: r.profile_id,
      title: lang === 'ar' && r.title_ar ? r.title_ar : r.title,
      who: whoOf(r.profile_id),
      wsName: wsNameOf(r.workspace_id),
      tone: toneOf(r.workspace_id),
      pos: clampPos(((at - from) / (to - from)) * 100),
      at,
      dateLabel: fmtDate(new Date(at), lang),
      rating: r.rating,
      proofs: r.proofs,
      taskId: r.task_id,
    };
  });

  const wsLanes: Lane[] = workspaces.map((w, i) => ({
    key: w.id,
    name: workspaceName(w, lang),
    tone: wsTone(w.color, i),
    isPerson: false,
    dots: dots.filter((d) => d.laneWs === w.id),
  }));
  const orphan = dots.filter((d) => !wsIndex.has(d.laneWs));
  if (orphan.length) wsLanes.push({ key: NO_WS, name: t('noWorkspace'), tone: toneOf(null), isPerson: false, dots: orphan });

  const personIds = [...new Set(rows.map((r) => r.profile_id))];
  const personLanes: Lane[] = personIds
    .map((id) => ({ key: id, name: whoOf(id), tone: toneOf(null), isPerson: true, dots: dots.filter((d) => d.lanePerson === id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const count = inWin.length;
  let delta: TimelineVM['delta'] = null;
  if (z === 'w') {
    if (count !== prevCount) delta = { up: count >= prevCount, n: Math.abs(count - prevCount), kind: 'abs' };
  } else if (prevCount > 0) {
    const pct = Math.round(((count - prevCount) / prevCount) * 100);
    delta = { up: pct >= 0, n: Math.abs(pct), kind: 'pct', prevMonth: new Date(prevFrom).getMonth() };
  }

  return {
    sample: false,
    count,
    delta,
    axis: axisFor(z, t, lang, now),
    dots,
    legend: wsLanes.map((l) => ({ name: l.name, tone: l.tone })),
    wsLanes,
    personLanes,
  };
}

/** The design's sample timeline (shown only when there are no achievements at all). */
export function buildDemo(z: Zoom, ctx: { t: T; lang: string }): TimelineVM {
  const { t, lang } = ctx;
  const d = DEMO[z];
  const year = new Date().getFullYear();
  const dots: Dot[] = d.pts.map((p) => {
    const at = new Date(year, p.month, p.day).getTime();
    return {
      id: `demo-${z}-${p.id}`,
      laneWs: p.ws,
      lanePerson: p.person,
      title: t(`demo.${p.title}`),
      who: t(`demo.people.${p.person}`),
      wsName: t(`demo.ws.${p.ws}`),
      tone: DEMO_WS[p.ws],
      pos: p.pos,
      at,
      dateLabel: fmtDate(new Date(at), lang),
      rating: p.rating,
      proofs: p.proofs,
      taskId: null,
    };
  });
  const wsKeys = Object.keys(DEMO_WS) as (keyof typeof DEMO_WS)[];
  const wsLanes: Lane[] = wsKeys.map((k) => ({
    key: k, name: t(`demo.ws.${k}`), tone: DEMO_WS[k], isPerson: false, dots: dots.filter((x) => x.laneWs === k),
  }));
  const personLanes: Lane[] = DEMO_PEOPLE.map((k) => ({
    key: k, name: t(`demo.people.${k}`), tone: DEMO_WS.m, isPerson: true, dots: dots.filter((x) => x.lanePerson === k),
  }));
  const axis =
    z === 'w'
      ? (() => {
          const from = startOfWeek().getTime();
          return [0, 2, 4].map((n) => weekdayName(new Date(from + n * DAY_MS), lang));
        })()
      : z === 'm'
        ? [1, 2, 3, 4].map((n) => t('weekN', { n }))
        : [7, 8, 9].map((m) => monthName(m, lang, year));
  return {
    sample: true,
    count: d.count,
    delta: { up: true, n: d.delta, kind: z === 'w' ? 'abs' : 'pct', prevMonth: 8 },
    axis,
    dots,
    legend: wsLanes.map((l) => ({ name: l.name, tone: l.tone })),
    wsLanes,
    personLanes,
  };
}

export function deltaLabel(vm: TimelineVM, z: Zoom, t: T, lang: string, fmt: (n: number) => string) {
  if (!vm.delta) return null;
  const arrow = vm.delta.up ? '▲' : '▼';
  if (z === 'w') return t('deltaWeek', { arrow, n: fmt(vm.delta.n) });
  if (z === 'm') return t('deltaMonth', { arrow, n: fmt(vm.delta.n), month: monthName(vm.delta.prevMonth ?? 0, lang) });
  return t('deltaQuarter', { arrow, n: fmt(vm.delta.n) });
}
