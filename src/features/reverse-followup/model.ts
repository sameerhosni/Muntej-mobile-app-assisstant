// View model for screen 09: things the employee is waiting on (live rows + the design's three sample items).
import type { DecisionWithContext, Profile, TaskWithPeople } from '@/lib/api';
import type { ColorToken, GradientToken } from '@/theme/tokens';
import { avatarGradientFor } from '@/components/ui';
import { formatNumber } from '@/features/home/value';

type T = (key: string, opts?: Record<string, unknown>) => string;
type Named = Pick<Profile, 'full_name' | 'full_name_ar'>;

export type WaitKind = 'decision' | 'blocked';

export type WaitItem = {
  id: string;
  sample: boolean;
  /** A pending decision I asked for, or a blocked task I own / help on. */
  kind: WaitKind;
  /** Person (or team) the employee waits on. */
  who: string;
  /** Avatar gradient; null = neutral grey dot (a team, not a person). */
  gradient: GradientToken | null;
  what: string;
  blocks: string;
  wait: string;
  waitHours: number;
  waitColor: ColorToken;
  /** Neutral reminder Muntej sends when nudged. */
  msg: string;
};

function firstName(p: Named | null | undefined, lang: string) {
  if (!p) return '';
  return ((lang === 'ar' && p.full_name_ar ? p.full_name_ar : p.full_name).split(' ')[0] ?? '').trim();
}

export function waitColor(hours: number): ColorToken {
  if (hours >= 24) return 'red';
  if (hours >= 12) return 'amberText';
  return 'textMuted';
}

/** "6h" / "2d" / "يومين" from a start time. */
export function waitLabel(fromIso: string, t: T, lang: string): { label: string; hours: number } {
  const mins = Math.max(1, Math.round((Date.now() - new Date(fromIso).getTime()) / 60000));
  const hours = mins / 60;
  if (mins < 60) return { label: t('wait.m', { n: formatNumber(mins, lang) }), hours };
  if (hours < 24) return { label: t('wait.h', { n: formatNumber(Math.round(hours), lang) }), hours };
  const days = Math.round(hours / 24);
  const label = days === 1 ? t('wait.d1') : days === 2 ? t('wait.d2') : t('wait.dn', { n: formatNumber(days, lang) });
  return { label, hours };
}

/** The three items from design/v2/html/ReverseFollowup.dc.html. */
export function demoItems(t: T): WaitItem[] {
  const rows: { id: 'a' | 'b' | 'c'; kind: WaitKind; gradient: GradientToken | null; hours: number }[] = [
    { id: 'a', kind: 'decision', gradient: 'avatarBlue', hours: 48 },
    { id: 'b', kind: 'blocked', gradient: 'avatarPurple', hours: 19 },
    { id: 'c', kind: 'decision', gradient: null, hours: 6 },
  ];
  return rows.map((r) => ({
    id: `demo-${r.id}`,
    sample: true,
    kind: r.kind,
    who: t(`demo.${r.id}.who`),
    gradient: r.gradient,
    what: t(`demo.${r.id}.what`),
    blocks: t(`demo.${r.id}.blocks`),
    wait: t(`demo.${r.id}.wait`),
    waitHours: r.hours,
    waitColor: waitColor(r.hours),
    msg: t(`demo.${r.id}.msg`),
  }));
}

/**
 * Live items:
 *  - pending decisions I requested (RLS returns mine) → waiting on the deciding manager;
 *  - blocked tasks I own → waiting on the helper (or whoever assigned it);
 *  - blocked tasks where I'm the helper → waiting on the owner.
 */
export function liveItems(ctx: {
  t: T;
  lang: string;
  me: Profile;
  team: Profile[];
  tasks: TaskWithPeople[];
  decisions: DecisionWithContext[];
}): WaitItem[] {
  const { t, lang, me, team, tasks, decisions } = ctx;
  const byId = (id: string | null) => team.find((p) => p.id === id) ?? null;
  const out: WaitItem[] = [];

  for (const d of decisions) {
    if (d.status !== 'pending' || d.requested_by !== me.id) continue;
    const w = waitLabel(d.created_at, t, lang);
    const what = (lang === 'ar' ? d.title_ar : null) ?? d.title;
    out.push({
      id: `d-${d.id}`,
      sample: false,
      kind: 'decision',
      who: firstName(byId(d.manager_id), lang) || t('yourManager'),
      gradient: 'avatarBlue',
      what,
      blocks: d.task?.title ?? t('yourTask'),
      wait: w.label,
      waitHours: w.hours,
      waitColor: waitColor(w.hours),
      msg: t('msgDecision', { what, wait: w.label }),
    });
  }

  for (const task of tasks) {
    if (task.status !== 'blocked') continue;
    let other: Named | null = null;
    if (task.owner_id === me.id) other = task.helper ?? byId(task.assigner_id);
    else if (task.helper_id === me.id) other = task.owner;
    else continue;
    const w = waitLabel(task.updated_at, t, lang);
    const name = firstName(other, lang) || t('yourManager');
    out.push({
      id: `t-${task.id}`,
      sample: false,
      kind: 'blocked',
      who: name,
      gradient: avatarGradientFor(name),
      what: task.title,
      blocks: t('blocked'),
      wait: w.label,
      waitHours: w.hours,
      waitColor: waitColor(w.hours),
      msg: t('msgTask', { what: task.title, wait: w.label }),
    });
  }

  return out.sort((a, b) => b.waitHours - a.waitHours);
}
