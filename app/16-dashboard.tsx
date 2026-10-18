// Screen 16 · Dashboard — see design/v2/html/Dashboard.dc.html (Arabic: DashboardAR.dc.html)
// Live data: tasks (done / on-time / clarity / chart), reviews (avg rating), activity_log (hours & SAR saved),
// each for the selected period vs the previous one. Empty periods show zeros / "—" honestly.
// Engagement row (points, kudos, streaks) is demo until the points tables exist. Insight = template over the numbers.
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Banknote, ChevronLeft, Clock, Eye, Flame, Hand, Heart, Sparkles, SquareCheck, Star } from 'lucide-react-native';
import { AppText, Card, Gradient, Hero, IconBadge, IconButton, PointsCoin } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useActivity, useTasks, useTeam } from '@/lib/api';
import { formatNumber, sarSaved } from '@/features/home/value';
import { firstName, personName } from '@/features/dashboard/metrics';
import { BUCKET_KEYS, computeDashboard, ENGAGEMENT_DEMO, useRatedReviews, type Period } from '@/features/dashboard/model';
import { NS } from '@/features/dashboard/strings';

const PERIODS: Period[] = ['d', 'w', 'm'];
const BAR_MAX = 70;

export default function DashboardScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const tasks = useTasks();
  const reviews = useRatedReviews();
  const activity = useActivity(1000);
  const team = useTeam();
  const [p, setP] = useState<Period>('w');

  const data = useMemo(
    () => computeDashboard(p, tasks.data ?? [], reviews.data ?? [], activity.data ?? []),
    [p, tasks.data, reviews.data, activity.data],
  );
  const { cur, prev, delta } = data;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const fmtPct = (n: number | null) => (n === null ? t('none') : t('pct', { n: formatNumber(n, lang) }));
  const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatNumber(Math.abs(n), lang, digits)}`;

  const kpis: { key: string; label: string; value: string; delta: string | null; up: boolean; icon: ReactNode; bg: ColorToken }[] = [
    {
      key: 'done', label: t('kpi.done'), value: formatNumber(cur.done, lang),
      delta: delta.done === null ? null : t('deltaPct', { n: signed(delta.done) }), up: (delta.done ?? 0) >= 0,
      icon: <SquareCheck color={colors.primary} size={16} strokeWidth={2} />, bg: 'primaryTint',
    },
    {
      key: 'onTime', label: t('kpi.onTime'), value: fmtPct(cur.onTime),
      delta: delta.onTime === null ? null : t('deltaPts', { n: signed(delta.onTime) }), up: (delta.onTime ?? 0) >= 0,
      icon: <Clock color={colors.green} size={16} strokeWidth={2} />, bg: 'greenTint',
    },
    {
      key: 'rating', label: t('kpi.rating'), value: cur.rating === null ? t('none') : formatNumber(cur.rating, lang, 1),
      delta: delta.rating === null ? null : signed(delta.rating, 1), up: (delta.rating ?? 0) >= 0,
      icon: <Star color={colors.amberText} size={16} strokeWidth={2} />, bg: 'amberTint',
    },
    {
      key: 'clarity', label: t('kpi.clarity'), value: fmtPct(cur.clarity),
      delta: delta.clarity === null ? null : t('deltaPts', { n: signed(delta.clarity) }), up: (delta.clarity ?? 0) >= 0,
      icon: <Eye color={colors.purple} size={16} strokeWidth={2} />, bg: 'purpleTint',
    },
  ];

  const insight = useMemo(() => {
    const period = t(`curLower.${p}`);
    if (cur.done === 0) {
      return cur.late > 0 ? t('insight.late', { n: formatNumber(cur.late, lang), period }) : t('insight.empty', { period });
    }
    if (delta.clarity !== null && delta.clarity >= 5) return t('insight.clarity', { n: formatNumber(delta.clarity, lang) });
    if (delta.done !== null && delta.done >= 10) return t('insight.up', { n: formatNumber(delta.done, lang), prev: t(`prev.${p}`) });
    const top = cur.topOwner ? team.data?.find((x) => x.id === cur.topOwner!.id) : null;
    if (cur.onTime === null) return t('insight.doneOnly', { n: formatNumber(cur.done, lang), period });
    if (top && cur.topOwner!.n >= 2) {
      return t('insight.top', { name: firstName(personName(top, lang)), n: formatNumber(cur.topOwner!.n, lang), pct: formatNumber(cur.onTime, lang) });
    }
    return t('insight.steady', { n: formatNumber(cur.done, lang), period, pct: formatNumber(cur.onTime, lang) });
  }, [cur, delta, p, team.data, lang, t]);

  const max = Math.max(1, ...cur.bars, ...prev.bars);
  const h = (v: number) => (v === 0 ? 2 : Math.max(4, Math.round((v / max) * BAR_MAX)));
  const eng = ENGAGEMENT_DEMO[p];
  const refreshing = tasks.isRefetching || reviews.isRefetching || activity.isRefetching;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { tasks.refetch(); reviews.refetch(); activity.refetch(); }}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Hero overlap={24}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconButton variant="glass" label={t('back')} onPress={back}>
              <ChevronLeft color={colors.onDark} size={22} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </IconButton>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AppText variant="titleLg" color="onDark" numberOfLines={1} style={{ fontSize: 24, lineHeight: 30 }}>
                {t('title')}
              </AppText>
              <AppText variant="small" color="onDarkMuted" numberOfLines={1}>
                {t('vs', { cur: t(`cur.${p}`), prev: t(`prev.${p}`) })}
              </AppText>
            </View>
            <Pressable
              onPress={() => router.push('/17-summaries')}
              accessibilityRole="button"
              accessibilityLabel={t('summarize')}
              style={({ pressed }) => ({
                minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg,
                borderRadius: radius.pill, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, opacity: pressed ? 0.85 : 1,
              })}
            >
              <Sparkles color={colors.onDark} size={16} strokeWidth={1.9} />
              <AppText variant="small" weight="bold" color="onDark">
                {t('summarize')}
              </AppText>
            </Pressable>
          </View>

          <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4, padding: 4, marginTop: spacing.xs, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill }}>
            {PERIODS.map((k) => {
              const on = p === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setP(k)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={{ flex: 1, minHeight: sizes.touch - 6, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.surface : colors.transparent }}
                >
                  <AppText weight="bold" color={on ? 'primary' : 'onDarkMuted'}>
                    {t(`tabs.${k}`)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -24, gap: spacing.lg }}>
          {/* KPI tiles */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {kpis.map((k) => (
              <View key={k.key} style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.button, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: 4, boxShadow: shadows.raised }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <IconBadge size={28} bg={k.bg}>{k.icon}</IconBadge>
                  <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {k.label}
                  </AppText>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                  <AppText weight="extrabold" style={{ fontSize: 22, lineHeight: 28 }}>
                    {k.value}
                  </AppText>
                  {k.delta !== null && (
                    <AppText variant="caption" weight="bold" color={k.up ? 'green' : 'red'} style={{ writingDirection: 'ltr' }}>
                      {k.up ? '▲' : '▼'} {k.delta}
                    </AppText>
                  )}
                </View>
              </View>
            ))}
          </View>

          {/* Value row */}
          <View style={{ borderRadius: radius.button, overflow: 'hidden' }}>
            <Gradient name="avatarBlue" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, opacity: 0.12 }} />
            <View style={{ flexDirection: 'row', gap: 6, padding: spacing.sm }}>
              <ValueTile bg="primaryTint" icon={<Clock color={colors.primary} size={14} strokeWidth={2.2} />}
                value={formatNumber(cur.hours, lang, 1)} label={t('hoursSaved')} />
              <ValueTile bg="greenTint" icon={<Banknote color={colors.green} size={14} strokeWidth={2.2} />}
                value={formatNumber(sarSaved(cur.hours), lang)} label={t('sarSaved')} />
              <ValueTile bg="orangeTint" icon={<Hand color={colors.orange} size={14} strokeWidth={2.2} />}
                value={formatNumber(0, lang)} label={t('chases')} />
            </View>
          </View>

          {/* Grouped bar chart: current vs previous */}
          <Card padding={spacing.xl} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText variant="section" style={{ fontSize: 16 }}>
                {t('chartTitle')}
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <Legend swatch={<Gradient name="avatarBlue" style={{ width: 8, height: 8, borderRadius: 2 }} />} label={t(`cur.${p}`)} />
                <Legend swatch={<View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.borderBlue }} />} label={t('previous')} />
              </View>
            </View>
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={`${t('chartA11y')}: ${cur.bars.map((v, i) => `${t(BUCKET_KEYS[p][i])} ${v} / ${prev.bars[i]}`).join(', ')}`}
              style={{ height: 96, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: 30 + i * 31, height: 1, backgroundColor: colors.surfaceMuted }} />
              ))}
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
                {cur.bars.map((v, i) => (
                  <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <AppText variant="micro" weight="extrabold" color="primary">
                      {formatNumber(v, lang)}
                    </AppText>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
                      <Gradient
                        name="avatarBlue"
                        style={{ width: 14, height: h(v), borderTopLeftRadius: 5, borderTopRightRadius: 5, boxShadow: v > 0 ? shadows.primary : undefined }}
                      />
                      <View style={{ width: 14, height: h(prev.bars[i]), borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: colors.borderBlue }} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
              {BUCKET_KEYS[p].map((k) => (
                <AppText key={k} variant="micro" color="textMuted" align="center" numberOfLines={1} style={{ flex: 1 }}>
                  {t(k)}
                </AppText>
              ))}
            </View>
          </Card>

          {/* Engagement (demo) */}
          <Card padding={spacing.md} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg }}>
            <EngItem icon={<PointsCoin size={22} />} value={formatNumber(eng.pts, lang)} label={t('pts')} color="orangeText" />
            <EngItem
              icon={<IconBadge size={22} bg="purpleTint"><Heart color={colors.purple} size={13} strokeWidth={2.2} /></IconBadge>}
              value={formatNumber(eng.kudos, lang)} label={t('kudos')} color="purple"
            />
            <EngItem
              icon={<IconBadge size={22} bg="orangeTint"><Flame color={colors.orange} size={13} strokeWidth={2.2} /></IconBadge>}
              value={formatNumber(eng.streaks, lang)} label={t('streaks')} color="orange"
            />
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => router.push('/28-kudos')}
              accessibilityRole="button"
              style={({ pressed }) => ({ minHeight: sizes.touch, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
            >
              <View style={{ height: 34, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.primaryTint }}>
                <AppText variant="caption" weight="bold" color="primary">
                  {t('recognize')}
                </AppText>
              </View>
            </Pressable>
          </Card>

          {/* AI insight */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.card, borderStartWidth: 4, borderStartColor: colors.primary, paddingVertical: spacing.md, paddingStart: spacing.lg, paddingEnd: spacing.xl, boxShadow: shadows.card }}>
            <IconBadge size={34} gradient="avatarBlue">
              <Sparkles color={colors.onDark} size={18} strokeWidth={1.8} />
            </IconBadge>
            <AppText weight="semibold" style={{ flex: 1, lineHeight: 20 }}>
              {insight}
            </AppText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ValueTile({ icon, value, label, bg }: { icon: ReactNode; value: string; label: string; bg: ColorToken }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 13, paddingVertical: spacing.sm, paddingHorizontal: 9, gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <IconBadge size={24} bg={bg}>{icon}</IconBadge>
        <AppText variant="stat" numberOfLines={1} style={{ flexShrink: 1 }}>
          {value}
        </AppText>
      </View>
      <AppText variant="micro" color="textMuted" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {swatch}
      <AppText variant="micro" color="textSoft">
        {label}
      </AppText>
    </View>
  );
}

function EngItem({ icon, value, label, color }: { icon: ReactNode; value: string; label: string; color: ColorToken }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon}
      <View>
        <AppText weight="extrabold" color={color} style={{ fontSize: 16, lineHeight: 20 }}>
          {value}
        </AppText>
        <AppText variant="micro" color="textMuted">
          {label}
        </AppText>
      </View>
    </View>
  );
}
