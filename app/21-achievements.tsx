// Screen 21 · Achievements — see design/v2/html/Timeline.dc.html (Arabic: TimelineAR.dc.html)
// One-page timeline of real wins. Live data: achievements (RLS: employee + direct manager) with the evidence count
// of each win's task, workspaces (lane names/colors) and profiles (person lanes). Lanes show whatever RLS returns.
// Optional ?workspace=<id> (from screen 19) highlights that lane and selects its latest win.
// The design's sample timeline appears only when there are no achievements at all (labelled "Sample").
// Value tiles (3 h / 600 SAR / 1 tap) and points per win (50 + 15 × proofs) are the design's estimates.
// Prototype tip t21: switch to By person and tap the dots.
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Banknote, Check, ChevronLeft, ChevronRight, Clock, Hand, User } from 'lucide-react-native';
import { AppText, Avatar, BOTTOM_CTA_SPACE, BottomCTA, Card, Hero, IconBadge, IconButton, PointsCoin } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useTeam } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { useWorkspaces } from '@/features/workspaces/useWorkspaces';
import { useAchievements } from '@/features/achievements/useAchievements';
import { buildDemo, buildLive, deltaLabel, type Dot, type Lane, type View as ViewBy, type Zoom } from '@/features/achievements/model';
import { NS } from '@/features/achievements/strings';

const VIEWS: ViewBy[] = ['ws', 'emp'];
const ZOOMS: Zoom[] = ['w', 'm', 'q'];
const LANE_H = 46;
const LABEL_W = 84;

export default function AchievementsScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const params = useLocalSearchParams<{ workspace?: string }>();
  const focusWs = typeof params.workspace === 'string' ? params.workspace : undefined;

  const achievements = useAchievements();
  const workspaces = useWorkspaces();
  const team = useTeam();

  const [view, setView] = useState<ViewBy>('ws');
  const [zoom, setZoom] = useState<Zoom>('m');
  const [sel, setSel] = useState<string | null>(null);

  const rows = achievements.data ?? [];
  const isDemo = achievements.isSuccess && rows.length === 0;

  const vm = useMemo(
    () =>
      isDemo
        ? buildDemo(zoom, { t, lang })
        : buildLive(zoom, rows, workspaces.data ?? [], team.data ?? [], { t, lang }),
    [isDemo, zoom, rows, workspaces.data, team.data, t, lang],
  );

  const latest = (dots: Dot[]) => dots.reduce<Dot | null>((b, d) => (!b || d.at > b.at ? d : b), null);
  const selected =
    vm.dots.find((d) => d.id === sel) ??
    (focusWs && !isDemo ? latest(vm.dots.filter((d) => d.laneWs === focusWs)) : null) ??
    latest(vm.dots);

  const lanes: Lane[] = view === 'ws' ? vm.wsLanes : vm.personLanes;
  const delta = deltaLabel(vm, zoom, t, lang, (n) => formatNumber(n, lang));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const openDetail = () => {
    if (selected?.taskId) router.push({ pathname: '/14-task-detail', params: { id: selected.taskId } });
    else router.push('/17-summaries');
  };
  const share = () => {
    const top = [...vm.dots].sort((a, b) => b.at - a.at).slice(0, 3).map((d) => d.title).join(' · ');
    Share.share({ message: t('shareText', { title: t('title'), n: formatNumber(vm.count, lang), top }) }).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: BOTTOM_CTA_SPACE + 12 }}
        refreshControl={
          <RefreshControl
            refreshing={achievements.isRefetching || workspaces.isRefetching}
            onRefresh={() => { achievements.refetch(); workspaces.refetch(); team.refetch(); }}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Hero overlap={30}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <IconButton variant="glass" label={t('back')} onPress={back}>
              <ChevronLeft color={colors.onDark} size={22} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </IconButton>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AppText variant="titleLg" color="onDark" numberOfLines={1} style={{ fontSize: 28, lineHeight: 34 }}>
                {t('title')}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppText variant="caption" color="onDarkMuted">{t('subtitle')}</AppText>
                {vm.sample && (
                  <View style={{ backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 }}>
                    <AppText variant="micro" weight="bold" color="onDark">{t('sample')}</AppText>
                  </View>
                )}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <AppText weight="extrabold" color="onDark" style={{ fontSize: 32, lineHeight: 36 }}>
                {formatNumber(vm.count, lang)}
              </AppText>
              {delta && (
                <View style={{ backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.mint, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <AppText variant="micro" weight="bold" color="onDark" numberOfLines={1}>{delta}</AppText>
                </View>
              )}
            </View>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.xxl, marginTop: -30, gap: spacing.lg }}>
          {/* View + zoom switches */}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View accessibilityRole="tablist" accessibilityLabel={t('viewBy')} style={[segWrap, { flex: 1 }]}>
              {VIEWS.map((v) => {
                const on = view === v;
                return (
                  <Pressable key={v} onPress={() => setView(v)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                    style={[segBtn, { backgroundColor: on ? colors.primary : colors.transparent }]}>
                    <AppText variant="small" weight="bold" color={on ? 'onDark' : 'textSoft'} numberOfLines={1}>{t(`view.${v}`)}</AppText>
                  </Pressable>
                );
              })}
            </View>
            <View accessibilityRole="tablist" accessibilityLabel={t('period')} style={[segWrap, { width: 150, gap: 2 }]}>
              {ZOOMS.map((z) => {
                const on = zoom === z;
                return (
                  <Pressable key={z} onPress={() => { setZoom(z); setSel(null); }} accessibilityRole="tab" accessibilityLabel={t(`zoomA11y.${z}`)}
                    accessibilityState={{ selected: on }} style={[segBtn, { backgroundColor: on ? colors.primaryTint : colors.transparent, paddingHorizontal: 0 }]}>
                    <AppText variant="caption" weight="bold" color={on ? 'primary' : 'textSoft'} numberOfLines={1}>{t(`zoom.${z}`)}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {achievements.isError && (
            <Card tone="red" padding={spacing.lg}>
              <AppText variant="small" color="red">{t('error')}</AppText>
            </Card>
          )}

          {/* Lanes */}
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.md, boxShadow: shadows.card }}>
            {lanes.length === 0 && !achievements.isLoading && (
              <AppText variant="small" color="textMuted" style={{ padding: spacing.sm }}>{t('emptyLanes')}</AppText>
            )}
            {lanes.map((l) => {
              const focused = !l.isPerson && !!focusWs && l.key === focusWs;
              return (
                <View key={l.key} style={{ height: LANE_H, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.sm, backgroundColor: focused ? colors.primaryTint : colors.transparent }}>
                  <View style={{ width: LABEL_W, flexDirection: 'row', alignItems: 'center', gap: 6, paddingStart: focused ? 6 : 0 }}>
                    {l.isPerson ? (
                      <Avatar name={l.name} size={24} />
                    ) : (
                      <View style={{ width: 10, height: 10, borderRadius: 4, backgroundColor: colors[l.tone.solid] }} />
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="caption" weight="bold" numberOfLines={1}>{l.name}</AppText>
                      <AppText variant="micro" weight="medium" color="textFaint" numberOfLines={1}>
                        {t('nDone', { n: formatNumber(l.dots.length, lang) })}
                      </AppText>
                    </View>
                  </View>
                  <View style={{ flex: 1, height: LANE_H }}>
                    <View style={{ position: 'absolute', start: 0, end: 0, top: 22, height: 3, borderRadius: 2, backgroundColor: colors.track }} />
                    {l.dots.map((d) => {
                      const on = selected?.id === d.id;
                      const size = on ? 22 : 14;
                      return (
                        <Pressable
                          key={d.id}
                          onPress={() => setSel(d.id)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={t('dotA11y', { title: d.title, who: d.who, date: d.dateLabel })}
                          style={{
                            position: 'absolute', top: 1, start: `${d.pos}%`, marginStart: -22,
                            width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center', zIndex: on ? 2 : 1,
                          }}
                        >
                          <View
                            style={{
                              width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: colors[d.tone.solid],
                              backgroundColor: on ? colors[d.tone.solid] : colors.surface, boxShadow: '0px 2px 6px rgba(11,42,91,0.18)',
                            }}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
            <View style={{ flexDirection: 'row', gap: spacing.sm, paddingTop: 2 }}>
              <View style={{ width: LABEL_W }} />
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}>
                {vm.axis.map((a, i) => (
                  <AppText key={`${a}-${i}`} variant="micro" weight="semibold" color="textFaint">{a}</AppText>
                ))}
              </View>
            </View>
            {view === 'emp' && vm.legend.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, justifyContent: 'center', paddingTop: spacing.sm }}>
                {vm.legend.map((g) => (
                  <View key={g.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: colors[g.tone.solid] }} />
                    <AppText variant="micro" color="textSoft">{g.name}</AppText>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Detail card */}
          {selected ? (
            <View
              accessibilityLiveRegion="polite"
              style={{
                backgroundColor: colors.surface, borderRadius: radius.card, borderStartWidth: 4, borderStartColor: colors[selected.tone.solid],
                paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl, gap: 6, boxShadow: shadows.raised,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[selected.tone.solid] }} />
                  <AppText variant="caption" weight="bold" color="textSoft" numberOfLines={1}>{selected.wsName}</AppText>
                </View>
                <View style={{ backgroundColor: colors.bg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                  <AppText variant="caption" weight="bold" color="textMuted">{selected.dateLabel}</AppText>
                </View>
              </View>
              <AppText variant="section" style={{ fontSize: 18, lineHeight: 24 }}>{selected.title}</AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <DetailChip bg="bg" fg="text" icon={
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
                    <User color={colors.primary} size={11} strokeWidth={2.6} />
                  </View>
                } label={selected.who} />
                <DetailChip bg="greenTint" fg="green" icon={
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                    <Check color={colors.onDark} size={11} strokeWidth={2.6} />
                  </View>
                } label={t('proofs', { n: formatNumber(selected.proofs, lang) })} />
                <DetailChip bg="orangeTint" fg="orangeText" icon={<PointsCoin size={18} />} label={t('pts', { n: formatNumber(50 + 15 * selected.proofs, lang) })} />
                {selected.rating !== null && (
                  <View style={{ backgroundColor: colors.amberTint, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
                    <AppText variant="caption" weight="bold" color="amberText">{t('rating', { n: formatNumber(selected.rating, lang) })}</AppText>
                  </View>
                )}
                <View style={{ flex: 1 }} />
                <Pressable onPress={openDetail} accessibilityRole="button" accessibilityLabel={t('openDetail')}
                  style={{ width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center', marginVertical: -6, marginEnd: -6 }}>
                  <IconBadge size={32} bg="primaryTint" round>
                    <ChevronRight color={colors.primary} size={16} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
                  </IconBadge>
                </Pressable>
              </View>
            </View>
          ) : (
            !achievements.isLoading && (
              <Card><AppText variant="small" color="textMuted">{t('emptyPeriod')}</AppText></Card>
            )
          )}

          {/* Value tiles */}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <ValueTile bg="primaryTint" icon={<Clock color={colors.primary} size={16} strokeWidth={2} />} value={t('savedVal')} label={t('savedReport')} />
            <ValueTile bg="greenTint" icon={<Banknote color={colors.green} size={16} strokeWidth={2} />} value={t('sarVal')} label={t('sarReport')} />
            <ValueTile bg="orangeTint" icon={<Hand color={colors.orange} size={16} strokeWidth={2} />} value={t('tapVal')} label={t('toBuild')} />
          </View>
        </View>
      </ScrollView>

      <BottomCTA
        primary={{ label: t('report'), onPress: () => router.push('/17-summaries') }}
        secondary={{ label: t('share'), onPress: share }}
      />
    </View>
  );
}

const segWrap = {
  backgroundColor: colors.surface,
  borderRadius: radius.pill,
  padding: 4,
  flexDirection: 'row',
  gap: 4,
  boxShadow: shadows.raised,
} as const;

const segBtn = {
  flex: 1,
  minHeight: sizes.touch - 4,
  borderRadius: radius.pill,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 6,
} as const;

function DetailChip({ icon, label, bg, fg }: { icon: ReactNode; label: string; bg: ColorToken; fg: ColorToken }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors[bg], borderRadius: radius.pill, paddingVertical: 4, paddingStart: 4, paddingEnd: spacing.md }}>
      {icon}
      <AppText variant="caption" weight="bold" color={fg} numberOfLines={1}>{label}</AppText>
    </View>
  );
}

function ValueTile({ icon, value, label, bg }: { icon: ReactNode; value: string; label: string; bg: ColorToken }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.tile, paddingVertical: 9, paddingHorizontal: spacing.md, gap: 3, boxShadow: shadows.tile }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <IconBadge size={28} bg={bg}>{icon}</IconBadge>
        <AppText variant="stat" numberOfLines={1} style={{ flexShrink: 1 }}>{value}</AppText>
      </View>
      <AppText variant="micro" color="textMuted" numberOfLines={1}>{label}</AppText>
    </View>
  );
}
