// Screen 30 · Team quests & league — see design/v2/html/TeamQuests.dc.html (Arabic: TeamQuestsAR.dc.html)
// Demo data: team quests, the department league and "you vs. last week" have no backend yet.
// Teams / Me switch (tip t30): "Me" compares you only with your own past; your rank stays private.
import { useState, type ComponentType } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Banknote, Bell, Check, ChartNoAxesColumn, Clock, Eye, Hand, Lock, Sparkles, Star, Trophy, Users, type LucideProps } from 'lucide-react-native';
import { AppText, Avatar, Card, Gradient, Hero, IconBadge, IconButton, PointsCoin, ProgressBar, StatTile } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { person, personLabel } from '@/features/demo/team';
import { TEAM_QUEST } from '@/features/employee-home/demo';
import {
  LEAGUE,
  ME_ROWS,
  MY_SHARE_PCT,
  QUEST_BONUS_PTS,
  QUEST_DAYS_LEFT,
  QUEST_HELPERS,
  QUEST_REWARD_SAR,
  QUEST_STATS,
  type MeIcon,
} from '@/features/team-quests/demo';
import { NS } from '@/features/team-quests/strings';

type Tab = 'teams' | 'me';

const ME_ICONS: Record<MeIcon, ComponentType<LucideProps>> = { clock: Clock, star: Star, eye: Eye, bell: Bell };

export default function TeamQuestsScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('teams');

  const n = (v: number) => formatNumber(v, lang);
  const trendLabel = (v: number) => `${v >= 0 ? '▲' : '▼'} ${n(Math.abs(v))}%`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.lg }} showsVerticalScrollIndicator={false}>
        <Hero variant="employee" overlap={30}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <IconButton
              variant="glass"
              label={t('back')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/25-employee-home'))}
            >
              <ChevronLeft color={colors.onDark} size={20} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </IconButton>
            <View style={{ gap: 2, flexShrink: 1 }}>
              <AppText variant="titleLg" color="onDark" style={{ fontSize: 24 }}>
                {t('title')}
              </AppText>
              <AppText variant="small" color="onDarkMuted">
                {t('subtitle')}
              </AppText>
            </View>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -30, gap: spacing.xl }}>
          {/* Teams / Me switch */}
          <View
            accessibilityRole="tablist"
            style={{ flexDirection: 'row', gap: 4, padding: 5, backgroundColor: colors.surface, borderRadius: radius.pill, boxShadow: shadows.raised }}
          >
            {(['teams', 'me'] as Tab[]).map((k) => {
              const on = tab === k;
              const label = (
                <AppText weight="bold" color={on ? 'onDark' : 'textMuted'}>
                  {t(k)}
                </AppText>
              );
              const box = { flex: 1, minHeight: sizes.touch, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' } as const;
              return (
                <Pressable
                  key={k}
                  onPress={() => setTab(k)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.88 : 1 })}
                >
                  {on ? (
                    <Gradient name="purple" style={box}>
                      {label}
                    </Gradient>
                  ) : (
                    <View style={box}>{label}</View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {tab === 'teams' ? (
            <>
              {/* Team quest */}
              <Card padding={0} style={{ gap: 0, overflow: 'hidden' }}>
                <LinearGradient
                  colors={[colors.purpleTint, colors.primaryTint]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl }}
                >
                  <View style={{ borderRadius: radius.md, boxShadow: shadows.tile }}>
                    <IconBadge size={44} gradient="points">
                      <Trophy color={colors.onDark} size={22} strokeWidth={1.8} />
                    </IconBadge>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <AppText variant="stat" display style={{ lineHeight: 22 }}>
                      {t('questTitle', { n: n(TEAM_QUEST.goal) })}
                    </AppText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                        <Users color={colors.purpleText} size={11} strokeWidth={2.6} />
                        <AppText variant="micro" weight="extrabold" color="purpleText">
                          {t('teamQuest')}
                        </AppText>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.amberTint, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                        <Clock color={colors.amberText} size={11} strokeWidth={2.6} />
                        <AppText variant="micro" weight="extrabold" color="amberStrong">
                          {t('daysLeft', { n: n(QUEST_DAYS_LEFT) })}
                        </AppText>
                      </View>
                    </View>
                  </View>
                </LinearGradient>

                <View style={{ padding: spacing.xl, gap: spacing.md }}>
                  <View
                    accessible
                    accessibilityLabel={t('progressA11y', { done: n(TEAM_QUEST.done), goal: n(TEAM_QUEST.goal) })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                  >
                    <View style={{ flex: 1 }}>
                      <ProgressBar value={TEAM_QUEST.done / TEAM_QUEST.goal} gradient="purple" height={12} />
                    </View>
                    <AppText weight="extrabold" style={{ writingDirection: 'ltr' }}>
                      {t('progress', { done: n(TEAM_QUEST.done), goal: n(TEAM_QUEST.goal) })}
                    </AppText>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.orangeTint, borderRadius: radius.md, paddingVertical: 7, paddingStart: spacing.md, paddingEnd: spacing.sm }}>
                    <Gradient name="points" style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}>
                      <Star color={colors.onDark} fill={colors.onDark} size={11} strokeWidth={2} />
                    </Gradient>
                    <AppText variant="small" weight="bold" color="orangeText" style={{ flex: 1 }}>
                      {t('reward', { n: n(QUEST_BONUS_PTS) })}
                    </AppText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
                      <Banknote color={colors.green} size={12} strokeWidth={2.4} />
                      <AppText variant="caption" weight="extrabold" color="greenText" numberOfLines={1}>
                        {t('sar', { n: n(QUEST_REWARD_SAR) })}
                      </AppText>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row' }}>
                      {QUEST_HELPERS.map((id, i) => {
                        const p = person(id);
                        return (
                          <View key={id} style={{ marginStart: i === 0 ? 0 : -8 }}>
                            <Avatar name={personLabel(p, lang)} size={26} gradient={p.gradient} ring />
                          </View>
                        );
                      })}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Check color={colors.green} size={13} strokeWidth={2.6} />
                      <AppText variant="caption" weight="bold" color="green">
                        {t('allHelped')}
                      </AppText>
                    </View>
                  </View>
                </View>
              </Card>

              {/* League */}
              <Card padding={0} style={{ gap: 0, paddingHorizontal: spacing.xl, paddingVertical: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}>
                  <IconBadge size={26} bg="purpleTint">
                    <ChartNoAxesColumn color={colors.purple} size={14} strokeWidth={2} />
                  </IconBadge>
                  <AppText variant="small" weight="extrabold">
                    {t('league')}
                  </AppText>
                </View>
                {LEAGUE.map((row, i) => {
                  const name = t(row.key) + (row.mine ? t('you') : '');
                  const rankBox = { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' } as const;
                  const rank = (
                    <AppText variant="small" weight="extrabold" display={false} color={i === 0 ? 'onDark' : 'purple'}>
                      {n(i + 1)}
                    </AppText>
                  );
                  return (
                    <View
                      key={row.key}
                      accessible
                      accessibilityLabel={t('leagueA11y', { rank: n(i + 1), name, pts: n(row.pts), trend: trendLabel(row.trend) })}
                      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}
                    >
                      {i === 0 ? (
                        <Gradient name="points" style={rankBox}>
                          {rank}
                        </Gradient>
                      ) : (
                        <View style={[rankBox, { backgroundColor: colors.purpleTint }]}>{rank}</View>
                      )}
                      <AppText weight={row.mine ? 'extrabold' : 'medium'} style={{ flex: 1 }} numberOfLines={1}>
                        {name}
                      </AppText>
                      <AppText variant="caption" weight="bold" color={row.trend >= 0 ? 'green' : 'red'} style={{ writingDirection: 'ltr' }}>
                        {trendLabel(row.trend)}
                      </AppText>
                      <View style={{ width: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                        <PointsCoin size={18} />
                        <AppText weight="extrabold" color="orangeText">
                          {n(row.pts)}
                        </AppText>
                      </View>
                    </View>
                  );
                })}
              </Card>
            </>
          ) : (
            <>
              {/* You vs. last week */}
              <Card padding={spacing.xxl} style={{ gap: spacing.lg, paddingTop: spacing.xl }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
                  <AppText variant="stat" display style={{ flexShrink: 1 }}>
                    {t('meTitle')}
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: spacing.md }}>
                    <Legend dot={colors.purple} label={t('now')} />
                    <Legend dot={colors.borderDashed} label={t('before')} />
                  </View>
                </View>
                {ME_ROWS.map((r) => {
                  const Icon = ME_ICONS[r.icon];
                  return (
                    <View
                      key={r.key}
                      accessible
                      accessibilityLabel={t('meRowA11y', { label: t(r.key), delta: r.delta })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                    >
                      <IconBadge size={34} bg={r.tint}>
                        <Icon color={colors[r.ink]} size={17} strokeWidth={1.9} />
                      </IconBadge>
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <AppText variant="small" weight="semibold">
                            {t(r.key)}
                          </AppText>
                          <AppText variant="small" weight="extrabold" color="green" style={{ writingDirection: 'ltr' }}>
                            {r.delta}
                          </AppText>
                        </View>
                        <Gradient name="purple" direction="horizontal" style={{ height: 7, borderRadius: 4, width: `${r.now * 100}%` }} />
                        <View style={{ height: 7, borderRadius: 4, width: `${r.prev * 100}%`, backgroundColor: colors.borderDashed }} />
                      </View>
                    </View>
                  );
                })}
              </Card>

              <LinearGradient
                colors={[colors.purpleTint, colors.primaryTint]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: radius.card, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, gap: spacing.sm }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <IconBadge size={34} bg="surface">
                    <Sparkles color={colors.purple} fill={colors.purple} size={17} strokeWidth={1.5} />
                  </IconBadge>
                  <AppText weight="bold" color="purpleDark" style={{ flex: 1 }}>
                    {t('drove', { n: n(MY_SHARE_PCT) })}
                  </AppText>
                </View>
                <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 }}>
                  <Lock color={colors.purpleText} size={12} strokeWidth={2.4} />
                  <AppText variant="caption" weight="bold" color="purpleText">
                    {t('private')}
                  </AppText>
                </View>
              </LinearGradient>
            </>
          )}

          {/* Stats */}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile iconBg="greenTint" icon={<Banknote color={colors.green} size={15} strokeWidth={2} />} value={n(QUEST_REWARD_SAR)} label={t('teamReward')} />
            <StatTile
              iconBg="primaryTint"
              icon={<Clock color={colors.primary} size={15} strokeWidth={2} />}
              value={t('hours', { n: formatNumber(QUEST_STATS.reportingHoursPerWeek, lang, 1) })}
              label={t('lessReporting')}
            />
            <StatTile iconBg="orangeTint" icon={<Hand color={colors.orange} size={15} strokeWidth={2} />} value={n(QUEST_STATS.statusMeetings)} label={t('statusMeetings')} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <AppText variant="micro" weight="bold" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}
