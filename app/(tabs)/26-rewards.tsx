// Screen 26 · Points & Rewards — see design/v2/html/Rewards.dc.html (Arabic: RewardsAR.dc.html)
// Demo data: points, rewards and redemptions have no backend yet (shared demo wallet in src/features/rewards).
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Pressable, ScrollView, View, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Banknote, Check, Clock, Heart, Paperclip, Sparkles, Star, Users, Zap, type LucideProps } from 'lucide-react-native';
import { AppText, Card, Gradient, Hero, IconBadge, IconButton, PointsCoin } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { NS } from '@/features/rewards/strings';
import { EARNED_EARLIER_THIS_WEEK, REWARDS, type Reward } from '@/features/rewards/demo';
import { PTS_PER_SAR, useWallet, wallet } from '@/features/rewards/wallet';
import { Confetti, HERO_CONFETTI } from '@/features/rewards/Confetti';

const RULES: { key: string; pts: string; Icon: ComponentType<LucideProps>; bg: ColorToken; fg: ColorToken }[] = [
  { key: 'ruleOnTime', pts: '+50', Icon: Clock, bg: 'primaryTint', fg: 'primary' },
  { key: 'ruleEarly', pts: '+20', Icon: Zap, bg: 'purpleTint', fg: 'purple' },
  { key: 'ruleProof', pts: '+15', Icon: Paperclip, bg: 'primaryTint', fg: 'cyan' },
  { key: 'ruleFiveStar', pts: '+30', Icon: Star, bg: 'amberTint', fg: 'amberText' },
  { key: 'ruleHelp', pts: '+25', Icon: Users, bg: 'greenTint', fg: 'green' },
  { key: 'ruleKudos', pts: '+10–50', Icon: Heart, bg: 'redTint', fg: 'red' },
];

export default function RewardsScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const w = useWallet();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const n = (v: number) => formatNumber(v, lang);
  const redeem = (r: Reward) => {
    if (wallet.redeem(r.id, r.cost)) setToast(t('toast', { name: t(`r_${r.id}`) }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }} showsVerticalScrollIndicator={false}>
        <Hero variant="employee" overlap={26}>
          <Confetti pieces={HERO_CONFETTI} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <IconButton
              variant="glass"
              label={t('back')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/25-employee-home'))}
            >
              <ArrowLeft color={colors.onDark} size={20} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </IconButton>
            <AppText variant="titleLg" color="onDark" style={{ fontSize: 24 }}>
              {t('title')}
            </AppText>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
            <View style={{ gap: 2, flexShrink: 1 }}>
              <AppText variant="small" color="onDarkMuted">
                {t('balance')}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
                <AppText weight="extrabold" color="onDark" style={{ fontSize: 40, lineHeight: 46 }}>
                  {n(w.balance)}
                </AppText>
                <AppText color="onDarkMuted">{t('pts')}</AppText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
                  <Banknote color={colors.greenText} size={13} strokeWidth={2.2} />
                  <AppText variant="small" weight="extrabold" color="greenText">
                    {t('approxSar', { n: n(w.sar) })}
                  </AppText>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                <View style={{ backgroundColor: colors.glass, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
                  <AppText variant="caption" weight="bold" color="mint">
                    {t('thisWeek', { n: n(EARNED_EARLIER_THIS_WEEK + w.earnedToday) })}
                  </AppText>
                </View>
                <View style={{ backgroundColor: colors.glass, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
                  <AppText variant="caption" weight="bold" color="onDark">
                    {t('neverExpires')}
                  </AppText>
                </View>
              </View>
            </View>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center' }}>
              <PointsCoin size={42} />
            </View>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -26, gap: spacing.xl }}>
          <Card elevation="raised" padding={spacing.lg} style={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Sparkles color={colors.purple} size={14} strokeWidth={2.2} />
              <AppText variant="small" weight="bold" color="textMuted">
                {t('earn')}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {RULES.map((r) => (
                <View
                  key={r.key}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, paddingVertical: 3, paddingStart: 3, paddingEnd: 9 }}
                >
                  <IconBadge size={20} round bg={r.bg}>
                    <r.Icon color={colors[r.fg]} size={12} strokeWidth={2.2} />
                  </IconBadge>
                  <AppText variant="caption">
                    {t(r.key)}{' '}
                    <AppText variant="caption" weight="bold" color="orangeText" style={{ writingDirection: 'ltr' }}>
                      {r.pts}
                    </AppText>
                  </AppText>
                </View>
              ))}
            </View>
          </Card>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {REWARDS.map((r) => {
              const got = !!w.requested[r.id];
              const can = w.balance >= r.cost;
              const name = t(`r_${r.id}`);
              return (
                <View
                  key={r.id}
                  style={{
                    flexGrow: 1,
                    flexBasis: '45%',
                    backgroundColor: colors.surface,
                    borderRadius: radius.card,
                    padding: spacing.lg,
                    gap: spacing.sm,
                    boxShadow: shadows.card,
                    opacity: can || got ? 1 : 0.75,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors[r.bg], alignItems: 'center', justifyContent: 'center' }}>
                      <AppText variant="small" weight="extrabold" color={r.fg}>
                        {t(`r_${r.id}_abbr`)}
                      </AppText>
                    </View>
                    <AppText variant="small" weight="bold" style={{ flex: 1, lineHeight: 17 }}>
                      {name}
                    </AppText>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <PointsCoin size={18} />
                    <AppText weight="extrabold" color="orangeText" numberOfLines={1}>
                      {t('costPts', { n: n(r.cost) })}
                    </AppText>
                    <View style={{ marginStart: 'auto', backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <AppText variant="micro" weight="extrabold" color="greenText" numberOfLines={1}>
                        {t('sar', { n: n(r.cost / PTS_PER_SAR) })}
                      </AppText>
                    </View>
                  </View>
                  <RedeemButton
                    state={got ? 'got' : can ? 'can' : 'locked'}
                    label={got ? t('requested') : can ? t('redeem') : t('toGo', { n: n(r.cost - w.balance) })}
                    a11y={t('redeemA11y', { name, n: n(r.cost) })}
                    onPress={() => redeem(r)}
                  />
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {toast && (
        <View
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            left: spacing.xxl,
            right: spacing.xxl,
            bottom: spacing.xxl,
            backgroundColor: colors.surface,
            borderRadius: radius.button,
            padding: spacing.lg,
            paddingHorizontal: spacing.xl,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            boxShadow: shadows.raised,
          }}
        >
          <IconBadge size={32} round bg="greenTint">
            <Check color={colors.green} size={18} strokeWidth={2.4} />
          </IconBadge>
          <AppText variant="small" style={{ flex: 1, lineHeight: 19 }}>
            {toast}
          </AppText>
        </View>
      )}
    </View>
  );
}

function RedeemButton({ state, label, a11y, onPress }: { state: 'got' | 'can' | 'locked'; label: string; a11y: string; onPress: () => void }) {
  const can = state === 'can';
  const inner = (
    <AppText variant="small" weight="bold" color={state === 'got' ? 'green' : can ? 'onDark' : 'textMuted'} numberOfLines={1}>
      {label}
    </AppText>
  );
  const box = { height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm } as const;
  return (
    <Pressable
      onPress={onPress}
      disabled={!can}
      accessibilityRole="button"
      accessibilityLabel={can ? a11y : label}
      accessibilityState={{ disabled: !can }}
      hitSlop={{ top: (sizes.touch - 36) / 2, bottom: (sizes.touch - 36) / 2 }}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, borderRadius: radius.pill, boxShadow: can ? shadows.purple : undefined })}
    >
      {can ? (
        <GradientBox style={box}>{inner}</GradientBox>
      ) : (
        <View
          style={[
            box,
            {
              backgroundColor: state === 'got' ? colors.greenTint : colors.bg,
              borderWidth: 1,
              borderColor: state === 'got' ? colors.greenLight : colors.border,
            },
          ]}
        >
          {inner}
        </View>
      )}
    </Pressable>
  );
}

function GradientBox({ style, children }: { style: ViewStyle; children: ReactNode }) {
  return (
    <Gradient name="purple" style={style}>
      {children}
    </Gradient>
  );
}
