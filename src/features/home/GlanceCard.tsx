// Manager Home, first card: "Today at a glance": the Work overview's 4 numbers (open · late · urgent · waiting for
// you) as a 2×2 grid, with Saree3's one line on what matters most right now, and a link to the full dashboard
// (screen 56). Each number opens those tasks. Numbers: src/features/overview/model.ts.
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { AppText, Card } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { useDecisions, useMyProfile, useTasks } from '@/lib/api';
import { displayName, useOrg } from '@/features/org/model';
import { startOfWeek } from '@/features/dashboard/metrics';
import { formatNumber } from './value';
import { computeOverview, DIRECT, type Overview } from '@/features/overview/model';
import { tasksLink } from './TodayHome';
import { BarRow } from '@/features/overview/Bars';

const en = {
  title: 'Today at a glance',
  open: 'Open work',
  late: 'Late',
  urgent: 'Urgent',
  waiting: 'Waiting for you',
  full: 'Full dashboard',
  s_late_team: '{{n}} late with {{team}}: I’m chasing them',
  s_late: '{{n}} late: I’m chasing them',
  s_waiting: '{{n}} waiting for your approval',
  s_urgent: '{{n}} urgent tasks open',
  s_ok: 'All on track ✓',
  s_empty: 'No open work yet. Give me a task with the mic',
  direct: 'your direct team',
  teamOf: '{{name}}’s team',
};
const ar: typeof en & Record<string, string> = {
  title: 'لمحة اليوم',
  open: 'أعمال مفتوحة',
  late: 'متأخرة',
  urgent: 'عاجلة',
  waiting: 'تنتظرك',
  full: 'اللوحة كاملة',
  s_late_team: '{{n}} متأخرة عند {{team}}، وأنا أتابعهم',
  s_late: '{{n}} متأخرة، وأنا أتابعهم',
  s_waiting: '{{n}} تنتظر اعتمادك',
  s_urgent: '{{n}} مهام عاجلة مفتوحة',
  s_ok: 'كل شي ماشي تمام ✓',
  s_empty: 'ما فيه أعمال مفتوحة. عطني مهمة بالمايك',
  direct: 'فريقك المباشر',
  teamOf: 'فريق {{name}}',
};
const NS = registerStrings('glance', { en, ar });

/** the one thing that matters most right now, by simple rules (exported for checking) */
export function smartLine(ov: Overview, waiting: number): { key: string; n?: number; team?: string } {
  const L = ov.lists;
  if (!L.open.length && !waiting) return { key: 's_empty' };
  if (L.late.length) {
    // name the team when most of the late work sits with one team
    const worst = ov.teams.length > 1 ? [...ov.teams].sort((a, b) => b.late - a.late)[0] : null;
    return worst && worst.late * 2 > L.late.length ? { key: 's_late_team', n: L.late.length, team: worst.key } : { key: 's_late', n: L.late.length };
  }
  if (waiting) return { key: 's_waiting', n: waiting };
  if (L.urgent.length) return { key: 's_urgent', n: L.urgent.length };
  return { key: 's_ok' };
}

export function GlanceCard() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const me = useMyProfile();
  const tasks = useTasks();
  const org = useOrg();
  const decisions = useDecisions('pending');
  const meId = me.data?.id ?? '';
  const ov = useMemo(
    () =>
      computeOverview({
        tasks: tasks.data ?? [],
        people: org.data ?? [],
        meId,
        decisions: decisions.data?.length ?? 0,
        team: 'all',
        since: startOfWeek(),
      }),
    [tasks.data, org.data, meId, decisions.data],
  );
  if (!tasks.data) return null;
  const L = ov.lists;
  const waiting = L.approval.length + ov.decisions;
  const line = smartLine(ov, waiting);
  const teamName = (key?: string) => {
    if (!key || key === DIRECT) return t('direct');
    const p = (org.data ?? []).find((x) => x.id === key);
    return p ? t('teamOf', { name: displayName(p, lang).split(' ')[0] }) : t('direct');
  };
  const tiles: { key: string; n: number; ids: string[]; fg: string; bg: ColorToken; href?: Href }[] = [
    { key: 'open', n: L.open.length, ids: L.open.map((x) => x.id), fg: colors.primary, bg: 'primaryTint' },
    { key: 'late', n: L.late.length, ids: L.late.map((x) => x.id), fg: colors.red, bg: 'redTint' },
    { key: 'urgent', n: L.urgent.length, ids: L.urgent.map((x) => x.id), fg: colors.amberText, bg: 'amberTint' },
    // waiting for you: finished work to approve, or (none of it) your decisions
    {
      key: 'waiting',
      n: waiting,
      ids: L.approval.map((x) => x.id),
      fg: colors.purple,
      bg: 'purpleTint',
      href: !L.approval.length && ov.decisions ? '/04-decisions' : undefined,
    },
  ];
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="section" style={{ flex: 1 }}>
          {t('title')}
        </AppText>
        <Pressable
          onPress={() => router.push('/56-overview' as Href)}
          accessibilityRole="link"
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: sizes.touch }}
        >
          <AppText variant="small" weight="bold" color="primary">
            {t('full')}
          </AppText>
          <Arrow color={colors.primary} size={16} />
        </Pressable>
      </View>
      {/* Saree3's one line: what matters most */}
      <AppText variant="small" weight="semibold" color={line.key.startsWith('s_late') ? 'red' : line.key === 's_ok' ? 'greenText' : 'textSoft'}>
        {t(line.key, { n: formatNumber(line.n ?? 0, lang), team: teamName(line.team) })}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {tiles.map((x) => (
          <Pressable
            key={x.key}
            onPress={() => router.push(x.href ?? tasksLink(x.ids))}
            disabled={x.n === 0}
            accessibilityRole="link"
            accessibilityLabel={`${t(x.key)}: ${x.n}`}
            style={({ pressed }) => ({
              flexGrow: 1,
              flexBasis: '45%',
              minHeight: 76,
              padding: spacing.md,
              borderRadius: radius.tile,
              backgroundColor: x.n ? colors[x.bg] : colors.surfaceMuted,
              justifyContent: 'center',
              gap: 2,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <AppText variant="titleLg" style={{ color: x.n ? x.fg : colors.textFaint }}>
              {formatNumber(x.n, lang)}
            </AppText>
            <AppText variant="small" weight="bold" color={x.n ? 'textSoft' : 'textMuted'}>
              {t(x.key)}
            </AppText>
          </Pressable>
        ))}
      </View>
      {/* the teams with most open work (late in red) */}
      {ov.teams.filter((x) => x.open).length > 1 && (
        <View style={{ gap: 2 }}>
          {[...ov.teams]
            .filter((x) => x.open)
            .sort((a, b) => b.open - a.open)
            .slice(0, 3)
            .map((x) => (
              <BarRow key={x.key} label={teamName(x.key)} value={x.open} max={Math.max(...ov.teams.map((y) => y.open))} color={x.late ? colors.red : colors.primary} />
            ))}
        </View>
      )}
    </Card>
  );
}
