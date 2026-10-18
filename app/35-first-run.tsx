// Screen 35 · Employee first run — see design/v2/html/FirstRun.dc.html (Arabic: FirstRunAR.dc.html)
// Demo: learn-by-doing on a sample first task (three coach marks: Accept → Add proof → Done) with local points.
// Only the employee's name comes from the live profile.
import { useState, type ComponentType } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, CircleQuestionMark, Clock, Flag, Hand, Paperclip, Star, X, type LucideProps } from 'lucide-react-native';
import { AppText, Avatar, Button, Gradient, Hero, IconBadge, IconButton, PointsCoin, StatTile } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { person, personLabel } from '@/features/demo/team';
import { NS } from '@/features/first-run/strings';

type Step = 0 | 1 | 2 | 3;
const PTS: Record<Step, number> = { 0: 0, 1: 0, 2: 15, 3: 65 };
const TIPS: { title: string; body: string; Icon: ComponentType<LucideProps>; arrow: `${number}%` }[] = [
  { title: 'tip1Title', body: 'tip1Body', Icon: Check, arrow: '20%' },
  { title: 'tip2Title', body: 'tip2Body', Icon: Paperclip, arrow: '48%' },
  { title: 'tip3Title', body: 'tip3Body', Icon: Flag, arrow: '72%' },
];

export default function FirstRunScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const me = useMyProfile();
  const [step, setStep] = useState<Step>(0);

  const manager = personLabel(person('ahmed'), lang);
  const full = me.data ? (lang === 'ar' && me.data.full_name_ar ? me.data.full_name_ar : me.data.full_name) : personLabel(person('faisal'), lang);
  const firstName = full.split(' ')[0];
  const finished = step >= 3;
  const tip = step < 3 ? TIPS[step] : null;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <Hero variant="employee" overlap={34}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconButton variant="glass" label={t('close')} onPress={close}>
              <X color={colors.onDark} size={20} strokeWidth={2} />
            </IconButton>
            <Avatar name={full} size={46} gradient="avatarBlue" ring />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AppText variant="small" color="onDarkMuted" numberOfLines={1}>
                {t('team', { name: manager })}
              </AppText>
              <AppText variant="titleLg" color="onDark" numberOfLines={1}>
                {t('hi', { name: firstName })}
              </AppText>
            </View>
            <View
              accessibilityLiveRegion="polite"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingVertical: 5, paddingStart: 5, paddingEnd: 11 }}
            >
              <PointsCoin size={22} />
              <AppText variant="small" weight="extrabold" color="onDark">
                {t('pts', { n: formatNumber(PTS[step], lang) })}
              </AppText>
            </View>
          </View>

          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('progress', { n: Math.min(step + 1, 3) })}
            style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}
          >
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < step ? colors.onDark : i === step ? colors.mint : colors.glassBorder }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -2 }}>
            <HeroChip dot="primaryLight" Icon={Clock} label={t('learn')} />
            <HeroChip dot="green" Icon={Check} label={t('noTraining')} />
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -34, gap: spacing.xxl }}>
          {/* The first task */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderWidth: 2,
              borderColor: finished ? colors.green : colors.surface,
              borderRadius: radius.cardLg,
              padding: spacing.xxl,
              gap: spacing.lg,
              boxShadow: '0px 10px 28px rgba(59,30,143,0.12)',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingVertical: 4, paddingStart: 4, paddingEnd: spacing.md, flexShrink: 1 }}>
                <Avatar name={manager} size={18} gradient="avatarBlue" />
                <AppText variant="caption" weight="bold" color="green" numberOfLines={1}>
                  {t('from', { name: manager })}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.amberTint, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 9 }}>
                <Clock color={colors.amberText} size={12} strokeWidth={2.4} />
                <AppText variant="caption" weight="bold" color="amberStrong">
                  {t('dueThu')}
                </AppText>
              </View>
            </View>
            <AppText variant="title" display style={{ fontSize: 19, lineHeight: 25 }}>
              {t('task')}
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <StepButton
                label={step >= 1 ? t('accepted') : t('accept')}
                filled={step >= 1}
                highlight={step === 0}
                onPress={() => step === 0 && setStep(1)}
              />
              <StepButton
                label={finished ? t('doneLabel') : t('markDone')}
                filled={finished}
                highlight={step === 2}
                onPress={() => step === 2 && setStep(3)}
              />
            </View>
            <Pressable
              onPress={() => step === 1 && setStep(2)}
              accessibilityRole="button"
              accessibilityState={{ disabled: step !== 1 }}
              style={({ pressed }) => ({
                minHeight: 46,
                borderRadius: radius.md,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: step === 1 ? colors.purple : colors.borderDashed,
                backgroundColor: step >= 2 ? colors.greenTint : step === 1 ? colors.purpleTint : colors.surfaceMuted,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: spacing.md,
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <AppText weight="semibold" align="center">
                {step >= 2 ? t('proofAdded') : t('addProof')}
              </AppText>
            </Pressable>
          </View>

          {/* Coach mark */}
          {tip && (
            <View
              accessibilityLiveRegion="polite"
              style={{ backgroundColor: colors.purpleDark, borderRadius: radius.button, paddingVertical: spacing.xl, paddingHorizontal: spacing.xxl, gap: 6, boxShadow: '0px 12px 28px rgba(59,30,143,0.32)' }}
            >
              <View
                style={{
                  position: 'absolute',
                  top: -7,
                  ...(isRTL ? { right: tip.arrow } : { left: tip.arrow }),
                  width: 14,
                  height: 14,
                  borderRadius: 2,
                  backgroundColor: colors.purpleDark,
                  transform: [{ rotate: '45deg' }],
                }}
              />
              <View style={{ alignSelf: 'flex-start', backgroundColor: colors.glass, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
                <AppText variant="micro" weight="extrabold" color="onDark" style={{ letterSpacing: 0.4 }}>
                  {t('step', { n: step + 1 })}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <IconBadge size={36} bg="glass">
                  <tip.Icon color={colors.mint} size={18} strokeWidth={2} />
                </IconBadge>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="lead" weight="extrabold" color="onDark">
                    {t(tip.title)}
                  </AppText>
                  <AppText variant="small" color="onDarkMuted">
                    {t(tip.body, { name: manager })}
                  </AppText>
                </View>
              </View>
            </View>
          )}

          {/* Finished */}
          {finished && (
            <View accessibilityLiveRegion="polite" style={{ backgroundColor: colors.greenTint, borderRadius: radius.card, paddingTop: 18, paddingBottom: spacing.xxl, paddingHorizontal: spacing.xxl, gap: spacing.sm, alignItems: 'center', overflow: 'hidden' }}>
              <View style={{ position: 'absolute', start: 24, top: 14, width: 8, height: 8, borderRadius: 2, backgroundColor: colors.purple, transform: [{ rotate: '20deg' }] }} />
              <View style={{ position: 'absolute', end: 30, top: 22, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.orange }} />
              <View style={{ position: 'absolute', end: 60, top: 10, width: 9, height: 4, borderRadius: 2, backgroundColor: colors.primary, transform: [{ rotate: '-30deg' }] }} />
              <View style={{ position: 'absolute', start: 56, bottom: 18, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.cyan }} />
              <AppText variant="title" display color="greenText" align="center">
                {t('finishedTitle')}
              </AppText>
              <AppText variant="small" weight="semibold" color="greenText" align="center">
                {t('finishedBody')}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.orangeTint, borderRadius: radius.pill, paddingVertical: 4, paddingStart: 4, paddingEnd: spacing.md }}>
                <Gradient name="points" style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}>
                  <Star color={colors.onDark} fill={colors.onDark} size={10} />
                </Gradient>
                <AppText variant="caption" weight="extrabold" color="orangeText">
                  {t('starter')}
                </AppText>
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile iconBg="primaryTint" icon={<Clock color={colors.primary} size={15} strokeWidth={2} />} value={t('minLearn', { n: formatNumber(2, lang) })} label={t('toLearn')} />
            <StatTile iconBg="purpleTint" icon={<Hand color={colors.purple} size={15} strokeWidth={2} />} value={formatNumber(0, lang)} label={t('trainingHours')} />
            <StatTile iconBg="orangeTint" icon={<PointsCoin size={16} />} value={`+${formatNumber(65, lang)}`} label={t('firstTaskPts')} />
          </View>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.screen, paddingTop: spacing.sm, paddingBottom: Math.max(insets.bottom, spacing.lg) + 6, gap: 6 }}>
        {finished && <Button tone="purple" label={t('goHome')} onPress={() => router.replace('/25-employee-home')} />}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable onPress={() => setStep(0)} accessibilityRole="button" style={{ minHeight: sizes.touch, justifyContent: 'center', paddingEnd: spacing.md }}>
            <AppText variant="small" weight="semibold" color="textMuted">
              {t('startOver')}
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => router.push('/36-how-to')}
            accessibilityRole="link"
            style={{ minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', gap: 6, paddingStart: spacing.md }}
          >
            <IconBadge size={24} bg="primaryTint">
              <CircleQuestionMark color={colors.primary} size={14} strokeWidth={2.2} />
            </IconBadge>
            <AppText variant="small" weight="bold" color="primary">
              {t('askMuntej')}
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function HeroChip({ dot, Icon, label }: { dot: 'primaryLight' | 'green'; Icon: ComponentType<LucideProps>; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingVertical: 4, paddingStart: 5, paddingEnd: spacing.md }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors[dot], alignItems: 'center', justifyContent: 'center' }}>
        <Icon color={colors.onDark} size={11} strokeWidth={2.6} />
      </View>
      <AppText variant="caption" weight="bold" color="onDark">
        {label}
      </AppText>
    </View>
  );
}

function StepButton({ label, filled, highlight, onPress }: { label: string; filled: boolean; highlight: boolean; onPress: () => void }) {
  const box = { flex: 1, minHeight: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm } as const;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !highlight }}
      style={({ pressed }) => ({ flex: 1, borderRadius: radius.pill, opacity: pressed ? 0.88 : 1, boxShadow: filled ? shadows.purple : undefined })}
    >
      {filled ? (
        <Gradient name="purple" style={box}>
          <AppText weight="bold" color="onDark" numberOfLines={1}>
            {label}
          </AppText>
        </Gradient>
      ) : (
        <View style={[box, { backgroundColor: colors.surface, borderWidth: highlight ? 2 : 1, borderColor: highlight ? colors.purple : colors.borderBlue }]}>
          <AppText weight="bold" color="primary" numberOfLines={1}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}
