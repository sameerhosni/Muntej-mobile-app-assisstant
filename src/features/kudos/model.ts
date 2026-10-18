// Screen 28 helpers: people to thank, the Muntej-drafted message, and the demo team wall.
import type { Profile, TaskWithPeople } from '@/lib/api';
import type { GradientToken } from '@/theme/tokens';
import { avatarGradientFor } from '@/components/ui';
import { person } from '@/features/demo/team';

type T = (key: string, opts?: Record<string, unknown>) => string;

export const VALUES = ['ownership', 'speed', 'quality', 'teamwork'] as const;
export type KudosValue = (typeof VALUES)[number];
export const AMOUNTS = [10, 25, 50] as const;

export type KudosPerson = {
  id: string;
  name: string;
  gradient: GradientToken;
  /** Lower-case English first name → key into the design's fallback drafts. */
  key: string;
};

export type WallItem = { id: string; from: string; to: string; value: string; msg: string; pts: number };

const DRAFT_KEYS = ['khalid', 'noura', 'saad', 'maha', 'faisal', 'abdullah'];

/** Design order: Khalid, Noura, Saad, Maha, Faisal. */
export function demoPeople(lang: string): KudosPerson[] {
  return ['khalid', 'noura', 'saad', 'maha', 'faisal'].map((id) => {
    const p = person(id);
    return { id: `demo-${id}`, name: lang === 'ar' ? p.nameAr : p.name, gradient: p.gradient, key: id };
  });
}

export function livePeople(team: Profile[], lang: string): KudosPerson[] {
  return team
    .filter((p) => p.role === 'employee')
    .map((p) => {
      const name = ((lang === 'ar' && p.full_name_ar ? p.full_name_ar : p.full_name).split(' ')[0] ?? '').trim();
      return { id: p.id, name, gradient: avatarGradientFor(p.full_name), key: (p.full_name.split(' ')[0] ?? '').toLowerCase() };
    });
}

/** Latest finished task title per owner id. */
export function latestDoneByOwner(tasks: TaskWithPeople[]): Record<string, string> {
  const out: Record<string, { title: string; at: string }> = {};
  for (const task of tasks) {
    if (task.status !== 'done' || !task.owner_id) continue;
    const at = task.closed_at ?? task.updated_at;
    const cur = out[task.owner_id];
    if (!cur || at > cur.at) out[task.owner_id] = { title: task.title, at };
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.title]));
}

export function draftFor(p: KudosPerson, value: KudosValue, latestTask: string | undefined, t: T): string {
  if (latestTask) return t(`draftFrom.${value}`, { name: p.name, task: latestTask });
  if (DRAFT_KEYS.includes(p.key)) return t(`drafts.${p.key}`);
  return t('draftGeneric', { name: p.name });
}

/** First sentence of the draft, as the wall shows it ("Just now · …"). */
export function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?؟](\s|$)/);
  return m ? m[0].trim() : text;
}

export function demoWall(t: T): WallItem[] {
  return [
    { id: 'f1', pts: 50 },
    { id: 'f2', pts: 10 },
    { id: 'f3', pts: 50 },
  ].map((f) => ({
    id: f.id,
    from: t(`feed.${f.id}.from`),
    to: t(`feed.${f.id}.to`),
    value: t(`feed.${f.id}.value`),
    msg: t(`feed.${f.id}.msg`),
    pts: f.pts,
  }));
}
