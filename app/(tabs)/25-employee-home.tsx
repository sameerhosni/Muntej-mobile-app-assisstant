// Screen 25 · Employee Home — see design/v2/html/EmployeeHome.dc.html (Arabic: EmployeeHomeAR.dc.html)
// Live: profile, "less reporting" hours (useHomeStats) and "Latest tasks" (Mine; tasks, RLS-scoped).
// Demo: level, XP, streak, badges, quests, points and rewards (shared demo wallet) — no gamification backend yet.
import { Fragment, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Award, Banknote, Check, ChevronRight, Clock, Flame, Gift, Hand, Trophy } from 'lucide-react-native';
import { AppText, Avatar, Card, Gradient, Hero, IconBadge, PointsCoin, PointsPill, ProgressBar } from '@/components/ui';
import { colors, radius, shadows, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useHomeStats, useMyProfile } from '@/lib/api';
import { formatNumber, hoursSaved } from '@/features/home/value';
import { LatestTasks } from '@/features/tasks/LatestTasks';
import { person, personLabel } from '@/features/demo/team';
import { LEVEL, NEXT_LEVEL_XP, useWallet, wallet } from '@/features/rewards/wallet';
import { NEXT_REWARD } from '@/features/rewards/demo';
import { Confetti } from '@/features/rewards/Confetti';
import { BADGE_COUNT, QUESTS, STREAK_DAYS, TEAM_QUEST } from '@/features/employee-home/demo';
import { LevelRing } from '@/features/employee-home/LevelRing';
import { NS } from '@/features/employee-home/strings';

export default function EmployeeHome() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const me = useMyProfile();
  const stats = useHomeStats();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const w = useWallet();

  const n = (v: number) => formatNumber(v, lang);
  const fullName = me.data ? (lang === 'ar' && me.data.full_name_ar ? me.data.full_name_ar : me.data.full_name) : personLabel(person('faisal'), lang);
  const firstName = fullName.split(' ')[0];
  // employee view of "time saved": updates they gave in one tap instead of writing reports
  const hours = stats.data ? hoursSaved(0, stats.data.updatesReceived) : null;
  const toGo = Math.max(NEXT_REWARD.cost - w.balance, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              Promise.all([qc.invalidateQueries({ queryKey: ['tasks'] }), stats.refetch()]).finally(() => setRefreshing(false));
            }}
            tintColor={colors.purple}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Hero variant="employee" overlap={30}>
          <Confetti
            pieces={[
              { kind: 'diamond', x: '43%', y: 118, size: 12, color: colors.mint },
              { kind: 'triangle', x: '90%', y: 104, size: 12, color: colors.gold },
              { kind: 'star', x: '77%', y: 226, size: 14, color: colors.goldLight },
              { kind: 'dot', x: '40%', y: 222, size: 8, color: colors.purpleLight },
              { kind: 'bar', x: '67%', y: 246, size: 10, color: colors.onDarkMuted, rotate: -30 },
              { kind: 'bar', x: '50%', y: 234, size: 10, color: colors.mint, rotate: 40 },
            ]}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ gap: 2, flexShrink: 1 }}>
              <AppText color="onDarkMuted">{t('morning')}</AppText>
              <AppText variant="titleLg" color="onDark" numberOfLines={1}>
                {firstName}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Pressable
                onPress={() => router.navigate('/26-rewards')}
                accessibilityRole="link"
                accessibilityLabel={t('balanceA11y', { pts: n(w.balance) })}
                hitSlop={{ top: 4, bottom: 4 }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  height: 36,
                  paddingStart: 5,
                  paddingEnd: spacing.lg,
                  borderRadius: radius.pill,
                  backgroundColor: colors.surface,
                  boxShadow: '0px 6px 16px rgba(59,30,143,0.28)',
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <PointsCoin size={26} />
                <AppText weight="extrabold" color="orangeText">
                  {n(w.balance)}
                </AppText>
              </Pressable>
              <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={t('settings')} hitSlop={2}>
                <Avatar name={fullName || '?'} size={42} gradient="avatarBlue" ring />
              </Pressable>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxl, marginTop: 2 }}>
            <Pressable onPress={() => router.navigate('/29-badges')} accessibilityRole="link" accessibilityLabel={t('levelA11y', { level: LEVEL })}>
              <LevelRing progress={w.xp / NEXT_LEVEL_XP} level={LEVEL} label={t('level')} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <View style={{ gap: 2 }}>
                <AppText variant="cardTitle" weight="bold" color="onDark">
                  {t('title')}
                </AppText>
                <AppText variant="small" weight="medium" color="onDarkMuted">
                  {t('nextTitle', { xp: n(w.xp), max: n(NEXT_LEVEL_XP) })}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <GlassChip icon={<Flame color={colors.goldLight} fill={colors.gold} size={13} strokeWidth={1.4} />} label={t('streak', { n: n(STREAK_DAYS) })} />
                <GlassChip icon={<Award color={colors.goldLight} size={13} strokeWidth={2.2} />} label={t('badges', { n: n(BADGE_COUNT) })} />
              </View>
            </View>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -30, gap: spacing.xl }}>
          {/* Your week */}
          <View
            accessibilityLabel={t('yourWeek')}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.card, paddingVertical: spacing.lg, paddingHorizontal: 4, boxShadow: shadows.raised }}
          >
            {[
              { icon: <Clock color={colors.primary} size={16} strokeWidth={2} />, bg: 'primaryTint' as ColorToken, value: hours === null ? '–' : t('hours', { n: formatNumber(hours, lang, 1) }), label: t('lessReporting') },
              { icon: <Banknote color={colors.green} size={16} strokeWidth={2} />, bg: 'greenTint' as ColorToken, value: n(w.sar), label: t('sarInPoints') },
              { icon: <Hand color={colors.orange} size={16} strokeWidth={2} />, bg: 'orangeTint' as ColorToken, value: n(0), label: t('statusMeetings') },
            ].map((s, i) => (
              <Fragment key={i}>
                {i > 0 && <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.border }} />}
                <View style={{ flex: 1, gap: 3, paddingHorizontal: spacing.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <IconBadge size={30} bg={s.bg}>
                      {s.icon}
                    </IconBadge>
                    <AppText variant="stat" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {s.value}
                    </AppText>
                  </View>
                  <AppText variant="micro" color="textMuted" numberOfLines={1}>
                    {s.label}
                  </AppText>
                </View>
              </Fragment>
            ))}
          </View>

          {/* Today's quests */}
          <View style={{ gap: spacing.md, marginTop: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="section">{t('quests')}</AppText>
              <PointsPill size="sm" label={t('ptsToday', { n: n(w.earnedToday) })} />
            </View>
            {QUESTS.map((q) => {
              const on = w.earned[`quest:${q.id}`] !== undefined;
              const name = t(`q_${q.id}`);
              return (
                <Pressable
                  key={q.id}
                  onPress={() => (on ? wallet.unearn(`quest:${q.id}`) : wallet.earn(`quest:${q.id}`, q.pts))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={t('questA11y', { name, n: n(q.pts) })}
                  style={({ pressed }) => ({
                    minHeight: 58,
                    borderRadius: radius.button,
                    borderWidth: 1,
                    borderColor: on ? colors.purpleBorder : colors.border,
                    backgroundColor: colors.surface,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.lg,
                    paddingHorizontal: spacing.xl,
                    paddingVertical: spacing.sm,
                    boxShadow: shadows.tile,
                    opacity: pressed ? 0.9 : 1,
                  })}
                >
                  {on ? (
                    <Gradient name="purple" style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                      <Check color={colors.onDark} size={15} strokeWidth={3} />
                    </Gradient>
                  ) : (
                    <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: colors.borderDashed }} />
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText weight="bold" style={{ textDecorationLine: on ? 'line-through' : 'none' }}>
                      {name}
                    </AppText>
                    <AppText variant="caption" color="textMuted">
                      {t(`q_${q.id}_hint`)}
                    </AppText>
                  </View>
                  <View style={{ backgroundColor: colors.orangeTint, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
                    <AppText weight="extrabold" color="orangeText" style={{ writingDirection: 'ltr' }}>
                      +{n(q.pts)}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Next reward */}
          <Card
            onPress={() => router.navigate('/26-rewards')}
            accessibilityLabel={t('rewardA11y', { name: t('nextReward') })}
            padding={spacing.lg}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl }}
          >
            <IconBadge size={40} bg="orangeTint">
              <Gift color={colors.orange} size={20} strokeWidth={1.8} />
            </IconBadge>
            <View style={{ flex: 1, minWidth: 0, gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
                <AppText variant="small" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                  <AppText variant="small" weight="bold">
                    {t('nextReward')}
                  </AppText>
                  {' · '}
                  <AppText variant="small" weight="bold" color="green">
                    {t('nextRewardSar', { n: n(NEXT_REWARD.cost / 10) })}
                  </AppText>
                </AppText>
                <AppText variant="small" weight="extrabold" color="orangeText" numberOfLines={1}>
                  {toGo > 0 ? t('toGo', { n: n(toGo) }) : t('unlocked')}
                </AppText>
              </View>
              <ProgressBar value={w.balance / NEXT_REWARD.cost} gradient="points" />
            </View>
          </Card>

          {/* Team quest */}
          <Card
            onPress={() => router.push('/30-team-quests')}
            accessibilityLabel={t('teamA11y', { done: n(TEAM_QUEST.done), goal: n(TEAM_QUEST.goal) })}
            padding={spacing.md}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, marginTop: -2 }}
          >
            <IconBadge size={40} bg="primaryTint">
              <Trophy color={colors.primary} size={20} strokeWidth={1.8} />
            </IconBadge>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <AppText variant="small" weight="bold" numberOfLines={1}>
                  {t('teamQuest', { done: n(TEAM_QUEST.done), goal: n(TEAM_QUEST.goal) })}
                </AppText>
                <AppText variant="small" weight="bold" color="primary" numberOfLines={1}>
                  {t('teamPrize')}
                </AppText>
              </View>
              <ProgressBar value={TEAM_QUEST.done / TEAM_QUEST.goal} gradient="avatarBlue" />
            </View>
            <ChevronRight color={colors.textFaint} size={16} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </Card>

          {/* Latest tasks (live, mine) */}
          <View style={{ marginTop: 6 }}>
            <LatestTasks filter="mine" role="employee" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function GlassChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        borderRadius: radius.pill,
        paddingVertical: 5,
        paddingStart: spacing.sm,
        paddingEnd: spacing.md,
      }}
    >
      {icon}
      <AppText variant="caption" weight="bold" color="onDark" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}
