// Every feature from "Everything Muntej does" (More) can sit on Home as a small card (owner, 26 Oct: "Customize Home
// with all features available, let the user choose what to show and hide, and show what he'll see"). Each card: the
// feature's icon and name, one live line where Muntej already has the number, and a tap that opens it. They start
// switched off; Customize Home (screen 58) turns them on (app_prefs.home: f_<key> = true).
import type { ComponentType } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  Award,
  Bot,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Eye,
  Gavel,
  Hand,
  Hourglass,
  Inbox,
  LayoutGrid,
  MessageCircleQuestion,
  Receipt,
  RotateCw,
  Sparkles,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  Waypoints,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Card, IconBadge } from '@/components/ui';
import { colors, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { useDecisions, useHomeStats, useMyProfile, useTasks, useTeam } from '@/lib/api';
import { useObjectives } from '@/features/objectives/api';
import { useIncomingCount } from '@/features/incoming/api';
import { useWhatsNew } from '@/features/launch/WhatsNew';
import { openSupport } from '@/features/support/intercom';
import { munti } from '@/features/munti/store';
import { MORE_NS } from '@/features/more/strings';
import { PREFS_NS } from './strings';

export type FeatureKey =
  | 'decisions'
  | 'objectives'
  | 'roadmap'
  | 'radar'
  | 'workspaces'
  | 'waiting'
  | 'pushback'
  | 'evidence'
  | 'autopilot'
  | 'incoming'
  | 'team'
  | 'invite'
  | 'performance'
  | 'overview'
  | 'achievements'
  | 'agents'
  | 'week'
  | 'whatsNew'
  | 'support';

type Feature = { key: FeatureKey; href: Href; Icon: ComponentType<LucideProps>; bg: ColorToken; fg: string; who: 'all' | 'manager' };

/** same order, icons and colours as More */
export const FEATURES: Feature[] = [
  { key: 'decisions', href: '/04-decisions', Icon: Gavel, bg: 'primaryTint', fg: colors.primary, who: 'manager' },
  { key: 'objectives', href: '/40-objectives', Icon: Target, bg: 'amberTint', fg: colors.amberText, who: 'all' },
  { key: 'roadmap', href: '/24-roadmap', Icon: Waypoints, bg: 'primaryTint', fg: colors.primary, who: 'manager' },
  { key: 'radar', href: '/11-load-radar', Icon: CircleGauge, bg: 'greenTint', fg: colors.green, who: 'manager' },
  { key: 'workspaces', href: '/19-workspaces', Icon: LayoutGrid, bg: 'purpleTint', fg: colors.purple, who: 'manager' },
  { key: 'waiting', href: '/09-reverse-followup', Icon: Hourglass, bg: 'purpleTint', fg: colors.purple, who: 'all' },
  { key: 'pushback', href: '/08-pushback', Icon: Hand, bg: 'orangeTint', fg: colors.orange, who: 'all' },
  { key: 'evidence', href: '/10-evidence', Icon: Eye, bg: 'redTint', fg: colors.red, who: 'manager' },
  { key: 'autopilot', href: '/03-autopilot', Icon: RotateCw, bg: 'amberTint', fg: colors.amberText, who: 'manager' },
  { key: 'incoming', href: '/42-incoming', Icon: Inbox, bg: 'primaryTint', fg: colors.primary, who: 'all' },
  { key: 'team', href: '/39-team', Icon: Users, bg: 'primaryTint', fg: colors.primary, who: 'manager' },
  { key: 'invite', href: '/48-invite', Icon: UserPlus, bg: 'greenTint', fg: colors.green, who: 'manager' },
  { key: 'performance', href: '/16-dashboard', Icon: TrendingUp, bg: 'greenTint', fg: colors.green, who: 'manager' },
  { key: 'overview', href: '/56-overview' as Href, Icon: LayoutGrid, bg: 'primaryTint', fg: colors.primary, who: 'manager' },
  { key: 'achievements', href: '/21-achievements', Icon: Award, bg: 'amberTint', fg: colors.amberText, who: 'all' },
  { key: 'agents', href: '/22-agents', Icon: Bot, bg: 'purpleTint', fg: colors.purple, who: 'manager' },
  { key: 'week', href: '/32-receipt', Icon: Receipt, bg: 'greenTint', fg: colors.green, who: 'all' },
  { key: 'whatsNew', href: '/50-whats-new' as Href, Icon: Sparkles, bg: 'purpleTint', fg: colors.purple, who: 'all' },
  { key: 'support', href: '/57-support' as Href, Icon: MessageCircleQuestion, bg: 'greenTint', fg: colors.green, who: 'all' },
];

/** the features this person can put on Home (employees don't get the manager-only ones, as in More) */
export function useMyFeatures() {
  const me = useMyProfile();
  const manager = me.data?.role !== 'employee';
  return FEATURES.filter((f) => f.who === 'all' || manager);
}

const OPEN = ['assigned', 'in_progress', 'blocked', 'returned'];

/** one live line per feature (null = its description from More) */
function useLines(): Partial<Record<FeatureKey, string>> {
  const { t } = useScreenT(PREFS_NS);
  const { lang } = useDirection();
  const n = (x: number) => formatNumber(x, lang);
  const me = useMyProfile();
  const id = me.data?.id;
  const tasks = useTasks();
  const decisions = useDecisions('pending');
  const objectives = useObjectives();
  const team = useTeam();
  const stats = useHomeStats();
  const incoming = useIncomingCount();
  const whatsNew = useWhatsNew();
  const all = tasks.data ?? [];
  const weekStart = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // Sunday
    return d.getTime();
  })();
  const mine = all.filter((x) => x.owner_id === id && OPEN.includes(x.status));
  const given = all.filter((x) => x.assigner_id === id && x.owner_id && x.owner_id !== id && OPEN.includes(x.status));
  const toReview = all.filter((x) => x.assigner_id === id && x.owner_id !== id && x.status === 'submitted');
  const doneWeek = all.filter((x) => x.status === 'done' && x.closed_at && Date.parse(x.closed_at) >= weekStart);
  const activeObjectives = (objectives.data ?? []).filter((o) => o.status === 'active');
  const people = (team.data ?? []).filter((p) => p.id !== id).length;
  const line = (count: number | undefined, key: string, zero?: string) =>
    count === undefined ? undefined : count ? t(key, { n: n(count), count }) : zero ? t(zero) : undefined;
  return {
    decisions: line(decisions.data?.length, 'l_decisions', 'l_decisions0'),
    objectives: line(objectives.data ? activeObjectives.length : undefined, 'l_objectives'),
    waiting: line(tasks.data ? given.length : undefined, 'l_waiting', 'l_waiting0'),
    pushback: line(tasks.data ? mine.length : undefined, 'l_mine'),
    evidence: line(tasks.data ? toReview.length : undefined, 'l_review', 'l_review0'),
    autopilot: line(stats.data?.followupsSent, 'l_autopilot'),
    incoming: line(incoming.count, 'l_incoming', 'l_incoming0'),
    radar: line(team.data ? people : undefined, 'l_team'),
    team: line(team.data ? people : undefined, 'l_team'),
    performance: line(tasks.data ? doneWeek.length : undefined, 'l_doneWeek'),
    achievements: line(tasks.data ? doneWeek.length : undefined, 'l_doneWeek'),
    week: line(tasks.data ? doneWeek.length : undefined, 'l_doneWeek'),
    whatsNew: line(whatsNew.ready ? whatsNew.count : undefined, 'l_whatsNew', 'l_whatsNew0'),
  };
}

function open(f: Feature) {
  if (f.key === 'support') openSupport().then((err) => err && munti.say(`⚠️ ${err}`));
  else router.push(f.href);
}

/** one feature's Home card */
export function FeatureCard({ feature: f, line }: { feature: Feature; line?: string }) {
  const { t } = useScreenT(MORE_NS);
  const { isRTL } = useDirection();
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  return (
    <Card onPress={() => open(f)} accessibilityLabel={t(f.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <IconBadge size={44} bg={f.bg} round>
        <f.Icon color={f.fg} size={22} />
      </IconBadge>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AppText weight="bold" numberOfLines={1}>
          {t(f.key)}
        </AppText>
        <AppText variant="caption" color={line ? 'textSoft' : 'textMuted'} numberOfLines={2}>
          {line ?? t(`${f.key}Sub`)}
        </AppText>
      </View>
      <Chevron color={colors.textMuted} size={20} />
    </Card>
  );
}

/** Home: the feature cards the person added, in More's order */
export function FeatureCards({ on }: { on: (key: string) => boolean }) {
  const lines = useLines();
  const picked = useMyFeatures().filter((f) => on(`f_${f.key}`));
  if (!picked.length) return null;
  return (
    <View style={{ gap: spacing.md }}>
      {picked.map((f) => (
        <FeatureCard key={f.key} feature={f} line={lines[f.key]} />
      ))}
    </View>
  );
}

/** Customize Home's preview: the card exactly as it will look, with live data */
export function FeaturePreview({ featureKey }: { featureKey: FeatureKey }) {
  const lines = useLines();
  const f = FEATURES.find((x) => x.key === featureKey);
  return f ? <FeatureCard feature={f} line={lines[f.key]} /> : null;
}
