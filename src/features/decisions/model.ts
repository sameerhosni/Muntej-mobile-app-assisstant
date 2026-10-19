// View model for decision cards: one shape for live rows and the design's sample cards.
import type { DecisionWithContext, Enum, Profile } from '@/lib/api';
import { DEMO_TEAM } from '@/features/demo/team';
import { formatNumber } from '@/features/home/value';
import { jsonNum, jsonStr, shortName } from './people';

export type Person = Pick<Profile, 'id' | 'full_name' | 'full_name_ar'>;
export type DecisionType = Enum<'decision_type'>;
export type Outcome = 'approved' | 'declined' | 'moved' | 'kept';

export type ChipVM = {
  label: string;
  tone: 'neutral' | 'orange' | 'red' | 'green';
  icon?: 'inbox' | 'hand';
  avatar?: string;
};

export type CardVM = {
  id: string;
  sample: boolean;
  createdAt: string;
  type: DecisionType;
  title: string;
  /** Requester initial avatar; null → show the type icon instead. */
  avatarName: string | null;
  badge: { label: string; tone: 'amber' | 'red' | 'primary'; clock?: boolean };
  risk: number | null;
  chips: ChipVM[];
  recAction: string;
  recWhy: string | null;
  reassign: boolean;
  owner: Person | null;
  suggested: Person | null;
  requesterShort: string | null;
  raw: DecisionWithContext | null;
};

type T = (key: string, opts?: Record<string, unknown>) => string;

export const FOLLOWUPS_PER_DECISION = 3;

function demoPerson(id: string): Person {
  const p = DEMO_TEAM.find((x) => x.id === id) ?? DEMO_TEAM[0];
  return { id: p.id, full_name: p.name, full_name_ar: p.nameAr };
}

/** The two cards from design/v2/html/Decisions.dc.html. */
export function demoCards(t: T, lang: string): CardVM[] {
  const now = Date.now();
  const abdullah = demoPerson('abdullah');
  const khalid = demoPerson('khalid');
  const noura = demoPerson('noura');
  const saves: ChipVM = { label: t('savesFollowups', { n: formatNumber(FOLLOWUPS_PER_DECISION, lang) }), tone: 'orange', icon: 'hand' };
  return [
    {
      id: 'demo-1',
      sample: true,
      createdAt: new Date(now - 12 * 60000).toISOString(),
      type: 'extension_request',
      title: t('demo.d1Title'),
      avatarName: shortName(abdullah, lang),
      badge: { label: t('plusDays', { n: formatNumber(2, lang) }), tone: 'amber', clock: true },
      risk: null,
      chips: [{ label: t('demo.d1Reason'), tone: 'neutral', icon: 'inbox' }, saves],
      recAction: t('demo.d1Action'),
      recWhy: t('demo.d1Why'),
      reassign: false,
      owner: abdullah,
      suggested: null,
      requesterShort: shortName(abdullah, lang),
      raw: null,
    },
    {
      id: 'demo-2',
      sample: true,
      createdAt: new Date(now - 40 * 60000).toISOString(),
      type: 'delay_risk',
      title: t('demo.d2Title'),
      avatarName: null,
      badge: { label: t('type.delay_risk'), tone: 'red' },
      risk: 70,
      chips: [
        { label: t('overdue', { n: formatNumber(3, lang) }), tone: 'red', avatar: shortName(khalid, lang) },
        { label: t('freeHours', { h: formatNumber(12, lang) }), tone: 'green', avatar: shortName(noura, lang) },
        saves,
      ],
      recAction: t('moveTo', { name: shortName(noura, lang) }),
      recWhy: t('demo.d2Why'),
      reassign: true,
      owner: khalid,
      suggested: noura,
      requesterShort: null,
      raw: null,
    },
  ];
}

/** Find who the recommendation suggests: details.suggested_owner_id, else a teammate named in the text. */
function findSuggested(d: DecisionWithContext, team: Profile[], ownerId: string | null): Person | null {
  const byId = jsonStr(d.details, 'suggested_owner_id');
  if (byId) {
    const p = team.find((x) => x.id === byId);
    if (p) return p;
  }
  const en = d.recommendation ?? '';
  const ar = d.recommendation_ar ?? '';
  return (
    team.find((p) => {
      if (p.id === ownerId || p.role !== 'employee') return false;
      const first = p.full_name.split(' ')[0];
      const firstAr = p.full_name_ar?.split(' ')[0];
      return (first && en.includes(first)) || (!!firstAr && ar.includes(firstAr));
    }) ?? null
  );
}

export function liveCard(
  d: DecisionWithContext,
  ctx: { t: T; lang: string; team: Profile[]; owners: Record<string, string | null> },
): CardVM {
  const { t, lang, team, owners } = ctx;
  const ownerId = d.task_id ? owners[d.task_id] ?? null : null;
  const owner = team.find((p) => p.id === ownerId) ?? null;
  const reassign = (d.type === 'delay_risk' || d.type === 'reassignment') && !!d.task_id;
  const suggested = reassign ? findSuggested(d, team, ownerId) : null;
  const requester = d.requester;
  const saves: ChipVM = { label: t('savesFollowups', { n: formatNumber(FOLLOWUPS_PER_DECISION, lang) }), tone: 'orange', icon: 'hand' };

  let badge: CardVM['badge'] = { label: t(`type.${d.type}`), tone: 'primary' };
  let risk: number | null = null;
  const chips: ChipVM[] = [];

  if (d.type === 'extension_request') {
    const days = jsonNum(d.details, 'requested_due_offset_days');
    if (days !== null) badge = { label: t('plusDays', { n: formatNumber(days, lang) }), tone: 'amber', clock: true };
    const why = jsonStr(d.details, 'employee_reason');
    if (why) chips.push({ label: why, tone: 'neutral', icon: 'inbox' });
  } else if (d.type === 'delay_risk') {
    badge = { label: t('type.delay_risk'), tone: 'red' };
    const progress = jsonNum(d.details, 'progress');
    const explicit = jsonNum(d.details, 'risk');
    risk = explicit ?? (progress !== null ? Math.min(95, Math.max(5, 100 - progress)) : null);
    const load = jsonNum(d.details, 'load_hours');
    const overdue = jsonNum(d.details, 'overdue');
    if (overdue !== null) chips.push({ label: t('overdue', { n: formatNumber(overdue, lang) }), tone: 'red', avatar: owner ? shortName(owner, lang) : undefined });
    else if (load !== null) chips.push({ label: t('loadHours', { h: formatNumber(load, lang) }), tone: 'red', avatar: owner ? shortName(owner, lang) : undefined });
    const free = jsonNum(d.details, 'free_hours');
    if (free !== null && suggested) chips.push({ label: t('freeHours', { h: formatNumber(free, lang) }), tone: 'green', avatar: shortName(suggested, lang) });
    const left = jsonNum(d.details, 'days_left');
    if (left !== null) chips.push({ label: t('daysLeft', { n: formatNumber(left, lang) }), tone: 'neutral' });
  }
  chips.push(saves);

  const rec = (lang === 'ar' ? d.recommendation_ar ?? d.recommendation : d.recommendation) ?? '';
  const sep = rec.search(/[:：]/);
  let recAction = sep > 0 ? rec.slice(0, sep).trim() : rec.trim();
  let recWhy: string | null = sep > 0 ? rec.slice(sep + 1).trim() || null : null;
  if (reassign && suggested) {
    recWhy = rec || null;
    recAction = t('moveTo', { name: shortName(suggested, lang) });
  }
  if (!recAction) recAction = t('approve');

  return {
    id: d.id,
    sample: false,
    createdAt: d.created_at,
    type: d.type,
    title: (lang === 'ar' ? d.title_ar : null) ?? d.title,
    avatarName: requester ? shortName(requester, lang) : null,
    badge,
    risk,
    chips,
    recAction,
    recWhy,
    reassign,
    owner,
    suggested,
    requesterShort: requester ? shortName(requester, lang) : null,
    raw: d,
  };
}

/** Filter chips on the Decisions screen: one bucket per card, by decision type. */
export type DecisionFilter = 'all' | 'extensions' | 'risks' | 'reassign' | 'other';
export const DECISION_FILTERS: DecisionFilter[] = ['all', 'extensions', 'risks', 'reassign', 'other'];

export function decisionBucket(type: DecisionType): Exclude<DecisionFilter, 'all'> {
  if (type === 'extension_request') return 'extensions';
  if (type === 'delay_risk') return 'risks';
  if (type === 'reassignment') return 'reassign';
  return 'other';
}

export function matchesDecisionFilter(card: CardVM, f: DecisionFilter): boolean {
  return f === 'all' || decisionBucket(card.type) === f;
}
