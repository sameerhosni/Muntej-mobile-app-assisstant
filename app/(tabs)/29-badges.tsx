// Screen 29 · Levels & badges — see design/v2/html/Badges.dc.html (Arabic: BadgesAR.dc.html)
// Demo data: levels, badges and reliability stats have no backend yet. Level + XP come from the shared demo wallet
// (src/features/rewards/wallet.ts) so this screen matches Employee Home. Tap a badge to see how to earn it (tip t29).
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, CircleCheck, Clock, Hand, ShieldCheck, Target } from 'lucide-react-native';
import { AppText, Card, Gradient, Hero, IconButton, PointsCoin, ProgressBar, StatTile } from '@/components/ui';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { LEVEL, NEXT_LEVEL_XP, PTS_PER_SAR, useWallet } from '@/features/rewards/wallet';
import { Confetti } from '@/features/rewards/Confetti';
import { BADGES, bandState, DEFAULT_BADGE, LEVEL_BANDS, RELIABILITY, TONES, type BadgeId } from '@/features/badges/demo';
import { Hexagon } from '@/features/badges/Hexagon';
import { NS } from '@/features/badges/strings';

const OVERLAP = 58;
const TRACK_INSET = 18;

export default function BadgesScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const w = useWallet();
  const [sel, setSel] = useState<BadgeId>(DEFAULT_BADGE);
  const [rowW, setRowW] = useState(0);

  const n = (v: number) => formatNumber(v, lang);
  const got = BADGES.filter((b) => b.got).length;
  const xpLeft = Math.max(NEXT_LEVEL_XP - w.xp, 0);
  const nowIdx = LEVEL_BANDS.findIndex((b) => bandState(b, LEVEL) === 'now');
  const nowBand = LEVEL_BANDS[nowIdx];

  // progress line: from the first circle to the current level, then part-way to the next by XP
  const center = (i: number) => ((i + 0.5) * rowW) / LEVEL_BANDS.length;
  const nextIdx = Math.min(nowIdx + 1, LEVEL_BANDS.length - 1);
  const fillEnd = center(nowIdx) + (center(nextIdx) - center(nowIdx)) * Math.min(w.xp / NEXT_LEVEL_XP, 1);
  const fillW = rowW > 0 ? Math.max(fillEnd - TRACK_INSET, 0) : 0;

  const badge = BADGES.find((b) => b.id === sel) ?? BADGES[0];
  const tone = TONES[badge.tone];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Hero variant="employee" overlap={OVERLAP}>
          <Confetti
            pieces={[
              { kind: 'diamond', x: '85%', y: 56, size: 12, color: colors.mint },
              { kind: 'triangle', x: '91%', y: 92, size: 12, color: colors.gold },
              { kind: 'star', x: '76%', y: 84, size: 13, color: colors.goldLight },
              { kind: 'dot', x: '87%', y: 118, size: 8, color: colors.purpleLight },
              { kind: 'bar', x: '69%', y: 140, size: 10, color: colors.onDarkMuted, rotate: -30 },
            ]}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <IconButton
              variant="glass"
              label={t('back')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/25-employee-home'))}
            >
              <ArrowLeft color={colors.onDark} size={20} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </IconButton>
            <View style={{ flexShrink: 1 }}>
              <AppText variant="titleLg" color="onDark" style={{ fontSize: 24 }}>
                {t('title')}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <ShieldCheck color={colors.onDark} size={14} strokeWidth={2.2} />
                <AppText variant="small" color="onDarkMuted">
                  {t('subtitle', { got: n(got), total: n(BADGES.length) })}
                </AppText>
              </View>
            </View>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -OVERLAP, gap: spacing.xl }}>
          {/* Levels */}
          <Card
            elevation="raised"
            padding={spacing.xl}
            style={{ paddingTop: spacing.xxl }}
          >
            <View
              accessible
              accessibilityLabel={t('levelsA11y', { level: LEVEL, name: t(nowBand.key), n: n(xpLeft) })}
              onLayout={(e) => setRowW(e.nativeEvent.layout.width)}
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <View style={{ position: 'absolute', start: TRACK_INSET, end: TRACK_INSET, top: 18, height: 4, borderRadius: 2, backgroundColor: colors.track }} />
              <View style={{ position: 'absolute', start: TRACK_INSET, width: fillW, top: 18, height: 4, borderRadius: 2, overflow: 'hidden' }}>
                {/* light → dark towards the current level, in reading direction */}
                <Gradient name="avatarPurple" direction="horizontal" style={{ flex: 1, transform: [{ scaleX: isRTL ? 1 : -1 }] }} />
              </View>
              {LEVEL_BANDS.map((b) => {
                const st = bandState(b, LEVEL);
                const now = st === 'now';
                const size = now ? 40 : 32;
                const circle = {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  borderWidth: 3,
                  alignItems: 'center',
                  justifyContent: 'center',
                } as const;
                const label = (
                  <AppText variant="caption" weight="extrabold" display={false} color={now ? 'onDark' : st === 'done' ? 'purple' : 'textFaint'}>
                    {b.range}
                  </AppText>
                );
                return (
                  <View key={b.key} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6 }}>
                    <View style={{ height: 40, justifyContent: 'center' }}>
                      {now ? (
                        <LinearGradient
                          colors={[colors.purple, colors.cyan]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[circle, { borderColor: colors.surface, boxShadow: shadows.purple }]}
                        >
                          {label}
                        </LinearGradient>
                      ) : (
                        <View
                          style={[
                            circle,
                            {
                              backgroundColor: st === 'done' ? colors.purpleTint : colors.surface,
                              borderColor: st === 'done' ? colors.purpleLight : colors.borderBlue,
                            },
                          ]}
                        >
                          {label}
                        </View>
                      )}
                    </View>
                    <AppText variant="micro" weight="bold" color={now ? 'purple' : 'textMuted'} numberOfLines={1}>
                      {t(b.key)}
                    </AppText>
                  </View>
                );
              })}
            </View>
            <View style={{ backgroundColor: colors.purpleTint, borderRadius: 12, paddingVertical: 7, paddingHorizontal: spacing.md }}>
              <AppText variant="caption" color="textSoft" align="center">
                <AppText variant="caption" weight="extrabold" color="purple" style={{ writingDirection: 'ltr' }}>
                  {t('xpToNext', { n: n(xpLeft) })}
                </AppText>{' '}
                {t('nextPerk')}
              </AppText>
            </View>
          </Card>

          {/* Badge grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {BADGES.map((b) => {
              const on = b.id === sel;
              const tn = TONES[b.tone];
              const name = t(`b_${b.id}`);
              return (
                <Pressable
                  key={b.id}
                  onPress={() => setSel(b.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t('badgeA11y', { name, state: b.got ? t('unlocked') : t('inProgress') })}
                  style={({ pressed }) => ({
                    flexGrow: 1,
                    flexBasis: '30%',
                    height: 98,
                    borderRadius: radius.card,
                    backgroundColor: on ? colors.purpleTint : colors.surface,
                    borderWidth: 1,
                    borderColor: on ? (b.got ? colors[tn.color] : colors.purple) : colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    paddingHorizontal: 4,
                    opacity: pressed ? 0.85 : b.got || on ? 1 : 0.8,
                    boxShadow: shadows.tile,
                  })}
                >
                  <Hexagon
                    id={b.id}
                    color={b.got ? tn.color : 'chip'}
                    dark={b.got ? tn.dark : 'borderBlue'}
                    fill={b.got ? tn.tint : 'textFaint'}
                    label={t(`b_${b.id}_abbr`)}
                  />
                  <AppText variant="micro" weight="bold" numberOfLines={1}>
                    {name}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Selected badge: how to earn it */}
          <Card accessibilityLabel={t(`b_${badge.id}`)} padding={spacing.xl} style={{ gap: 6, paddingStart: spacing.xxl + 2, paddingEnd: spacing.xxl, overflow: 'hidden' }}>
            <View
              style={{
                position: 'absolute',
                start: 0,
                top: 16,
                bottom: 16,
                width: 4,
                borderTopEndRadius: 4,
                borderBottomEndRadius: 4,
                backgroundColor: badge.got ? colors[tone.color] : colors.amberText,
              }}
            />
            <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
              <AppText variant="stat" display style={{ flexShrink: 1 }}>
                {t(`b_${badge.id}`)}
              </AppText>
              <View style={{ backgroundColor: badge.got ? colors[tone.tint] : colors.amberTint, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 }}>
                <AppText variant="caption" weight="bold" color={badge.got ? tone.dark : 'amberStrong'}>
                  {badge.got ? t('unlocked') : t('inProgress')}
                </AppText>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Target color={colors.purple} size={14} strokeWidth={2.2} />
              <AppText variant="small" color="textSoft" style={{ flex: 1, lineHeight: 18 }}>
                {t(`b_${badge.id}_how`)}
              </AppText>
            </View>
            <ProgressBar value={badge.progress} gradient="purple" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <PointsCoin size={20} />
              <AppText variant="small" weight="extrabold" color="orangeText">
                {t('pts', { n: n(badge.pts) })}
              </AppText>
              <View style={{ backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                <AppText variant="caption" weight="extrabold" color="greenText">
                  {t('sar', { n: n(badge.pts / PTS_PER_SAR) })}
                </AppText>
              </View>
            </View>
          </Card>

          {/* Reliability stats */}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile
              iconBg="primaryTint"
              icon={<Clock color={colors.primary} size={15} strokeWidth={2} />}
              value={t('overtimeValue', { n: n(RELIABILITY.overtimeHours) })}
              label={t('overtime')}
            />
            <StatTile
              iconBg="greenTint"
              icon={<CircleCheck color={colors.green} size={15} strokeWidth={2} />}
              value={`${n(RELIABILITY.onTimePct)}%`}
              label={t('onTime')}
            />
            <StatTile
              iconBg="orangeTint"
              icon={<Hand color={colors.orange} size={15} strokeWidth={2} />}
              value={n(RELIABILITY.reminders)}
              label={t('reminders')}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
