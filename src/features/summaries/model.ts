// Screen 17: one-tap summaries built locally from live tasks / reviews (no AI call yet).
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { supabase } from '@/lib/supabase';
import type { Profile, TaskWithPeople, Workspace } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { closedAt, DAY_MS, firstName, isLateOpen, isOpen, onTimeRate, personName } from '@/features/dashboard/metrics';
import type { ReviewLite } from '@/features/dashboard/model';

export type Tab = 'p' | 'r' | 'e';
export type Tone = 'ok' | 'info' | 'warn' | 'risk' | 'star' | 'next';
export type Bullet = { text: string; tone: Tone };
export type Item = { id: string; name: string };
export type SummaryVM = {
  subject: string;
  meta: string;
  score: string;
  bullets: Bullet[];
  /** Employee tab only: AI-style feedback draft (template for now). */
  draft?: string;
  /** First name for the feedback card. */
  short?: string;
};

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces', 'summaries'],
    queryFn: async (): Promise<Pick<Workspace, 'id' | 'name' | 'name_ar' | 'color'>[]> => {
      const res = await supabase.from('workspaces').select('id, name, name_ar, color').order('name');
      if (res.error) throw new Error(res.error.message);
      return res.data ?? [];
    },
  });
}

type Ctx = {
  t: TFunction;
  lang: string;
  tasks: TaskWithPeople[];
  reviews: ReviewLite[];
  team: Profile[];
  workspaceCount: number;
};

function dateLabel(iso: string, lang: string) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** Done / in progress / late / next due for a set of tasks over the last 30 days. */
function core(scope: TaskWithPeople[], now: number) {
  const since = now - 30 * DAY_MS;
  const relevant = scope.filter((x) => {
    if (x.status === 'cancelled' || x.status === 'draft') return false;
    const c = closedAt(x);
    if (c !== null) return c >= since;
    return isOpen(x) || new Date(x.created_at).getTime() >= since;
  });
  const done = relevant.filter((x) => x.status === 'done');
  const review = relevant.filter((x) => x.status === 'submitted').length;
  const inProgress = relevant.filter((x) => ['assigned', 'in_progress', 'blocked', 'returned'].includes(x.status)).length;
  const late = relevant.filter((x) => isLateOpen(x, now));
  const next = relevant
    .filter((x) => isOpen(x) && x.due_at && new Date(x.due_at).getTime() >= now)
    .sort((a, b) => a.due_at!.localeCompare(b.due_at!))[0];
  const rate = onTimeRate(relevant, now).rate;
  const lastDone = [...done].sort((a, b) => (closedAt(b) ?? 0) - (closedAt(a) ?? 0))[0];
  return { relevant, done, review, inProgress, late, next, rate, lastDone };
}

function lateOwner(late: TaskWithPeople[], lang: string) {
  const counts = new Map<string, { n: number; name: string }>();
  for (const x of late) {
    if (!x.owner) continue;
    const cur = counts.get(x.owner.id) ?? { n: 0, name: firstName(personName(x.owner, lang)) };
    cur.n++;
    counts.set(x.owner.id, cur);
  }
  let best: { n: number; name: string } | null = null;
  for (const v of counts.values()) if (!best || v.n > best.n) best = v;
  return best?.name ?? null;
}

function commonBullets(c: ReturnType<typeof core>, ctx: Ctx, employee: boolean): Bullet[] {
  const { t, lang } = ctx;
  const n = (x: number) => formatNumber(x, lang);
  const first: Bullet = employee
    ? {
        text: c.rate === null ? t('b.doneEmpNoRate', { n: n(c.done.length) }) : t('b.doneEmp', { n: n(c.done.length), pct: n(c.rate) }),
        tone: 'ok',
      }
    : { text: t('b.doneOf', { done: n(c.done.length), total: n(c.relevant.length), review: n(c.review) }), tone: 'ok' };
  const owner = employee ? null : lateOwner(c.late, lang);
  const late: Bullet =
    c.late.length === 0
      ? { text: t('b.nothingLate'), tone: 'ok' }
      : {
          text: owner ? t('b.late', { n: n(c.late.length), name: owner }) : t('b.lateEmp', { n: n(c.late.length) }),
          tone: c.late.length > 2 ? 'risk' : 'warn',
        };
  return [
    first,
    { text: t('b.inProgress', { n: n(c.inProgress) }), tone: 'info' },
    late,
    c.next
      ? { text: t('b.nextDue', { task: c.next.title, date: dateLabel(c.next.due_at!, lang) }), tone: 'next' }
      : { text: t('b.nextNone'), tone: 'next' },
  ];
}

export function summarize(tab: Tab, item: Item, ctx: Ctx): SummaryVM {
  const id = item.id;
  const { t, lang, tasks, reviews, team } = ctx;
  const now = Date.now();
  const n = (x: number) => formatNumber(x, lang);

  if (tab === 'e') {
    const p = team.find((x) => x.id === id);
    const name = personName(p, lang);
    const c = core(tasks.filter((x) => x.owner_id === id), now);
    const since = now - 30 * DAY_MS;
    const ratings = reviews
      .filter((r) => r.submitted_by === id && r.rating !== null && new Date(r.decided_at ?? r.created_at).getTime() >= since)
      .map((r) => r.rating as number);
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    const title = p ? (lang === 'ar' && p.title_ar ? p.title_ar : p.title) : null;
    const score =
      avg !== null ? t('score.rating', { n: formatNumber(avg, lang, 1) }) : c.rate !== null ? t('score.onTime', { n: n(c.rate) }) : t('score.none');
    const task = c.lastDone?.title ?? c.relevant[0]?.title;
    const draft =
      c.late.length > 0 && task
        ? t('draft.late', { task, n: n(c.late.length) })
        : c.lastDone && (c.rate === null || c.rate >= 80)
          ? t('draft.good', { task: c.lastDone.title })
          : t('draft.empty');
    return {
      subject: name,
      meta: title ? t('meta.employee', { title }) : t('meta.employeeNoTitle'),
      score,
      bullets: commonBullets(c, ctx, true),
      draft,
      short: firstName(name),
    };
  }

  const scope = tab === 'p' ? tasks.filter((x) => x.workspace_id === id) : tasks;
  const c = core(scope, now);
  const members = new Set(c.relevant.map((x) => x.owner_id).filter(Boolean)).size;
  if (tab === 'p') {
    const pct = c.relevant.length ? Math.round((c.done.length / c.relevant.length) * 100) : null;
    return {
      subject: item.name,
      meta: t('meta.project', { m: n(members), n: n(c.relevant.length) }),
      score: pct === null ? t('score.none') : t('score.done', { n: n(pct) }),
      bullets: commonBullets(c, ctx, false),
    };
  }
  return {
    subject: t('allProjects'),
    meta: t('meta.product', { w: n(ctx.workspaceCount), m: n(members) }),
    score: c.rate === null ? t('score.none') : t('score.onTime', { n: n(c.rate) }),
    bullets: commonBullets(c, ctx, false),
  };
}

/** Design sample (used when that tab has nothing live to summarize). */
export function demoSummary(tab: Tab, t: TFunction): SummaryVM {
  const k = `demo.${tab}`;
  const tones: Record<Tab, Tone[]> = {
    p: ['ok', 'warn', 'ok', 'next'],
    r: ['ok', 'warn', 'ok', 'next'],
    e: ['ok', 'star', 'warn', 'risk'],
  };
  const subject = t(`${k}.subject`);
  return {
    subject,
    meta: t(`${k}.meta`),
    score: t(`${k}.score`),
    bullets: [1, 2, 3, 4].map((i) => ({ text: t(`${k}.b${i}`), tone: tones[tab][i - 1] })),
    draft: tab === 'e' ? t('demo.e.feedback') : undefined,
    short: tab === 'e' ? firstName(subject) : undefined,
  };
}
