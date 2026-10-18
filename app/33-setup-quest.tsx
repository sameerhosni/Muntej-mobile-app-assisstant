// Screen 33 · Setup quest — see design/v2/html/SetupQuest.dc.html (Arabic: SetupQuestAR.dc.html)
// Demo state (no onboarding-progress table yet). Ticking a step moves the main CTA to the next open step;
// the CTA opens that step's real screen.
import { useState, type ComponentType, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Banknote, CircleCheck, Clock, Hand, MessageCircle, Mic, Moon, Users, X, type LucideProps } from 'lucide-react-native';
import { AppText, Button, Hero, IconBadge, IconButton, PointsCoin } from '@/components/ui';
import { colors, gradients, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { useDirection } from '@/lib/i18n';
import { useMyProfile } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { person, personLabel } from '@/features/demo/team';
import { NS } from '@/features/setup-quest/strings';

type StepId = 'task' | 'team' | 'whatsapp' | 'quiet' | 'decision';

const STEPS: { id: StepId; pts: number; Icon: ComponentType<LucideProps>; tint: ColorToken; ink: ColorToken; href: Href }[] = [
  { id: 'task', pts: 100, Icon: Mic, tint: 'primaryTint', ink: 'primary', href: { pathname: '/02-capture', params: { mode: 'text' } } },
  { id: 'team', pts: 100, Icon: Users, tint: 'purpleTint', ink: 'purple', href: '/34-add-team' },
  { id: 'whatsapp', pts: 100, Icon: MessageCircle, tint: 'greenTint', ink: 'green', href: '/12-sources' },
  { id: 'quiet', pts: 100, Icon: Moon, tint: 'amberTint', ink: 'amberText', href: '/18-alerts' },
  { id: 'decision', pts: 100, Icon: CircleCheck, tint: 'orangeTint', ink: 'orange', href: '/04-decisions' },
];
const TOTAL_PTS = STEPS.reduce((s, x) => s + x.pts, 0);

const RING = 64;
const R = 27;
const CIRC = 2 * Math.PI * R;

export default function SetupQuestScreen() {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const insets = useSafeAreaInsets();
  const me = useMyProfile();
  const [done, setDone] = useState<Partial<Record<StepId, boolean>>>({ task: true, team: true });

  const n = STEPS.filter((s) => done[s.id]).length;
  const earned = STEPS.reduce((s, x) => s + (done[x.id] ? x.pts : 0), 0);
  const nextIdx = STEPS.findIndex((s) => !done[s.id]);
  const next = nextIdx >= 0 ? STEPS[nextIdx] : null;
  const allDone = !next;

  const fullName = lang === 'ar' ? (me.data?.full_name_ar ?? me.data?.full_name) : me.data?.full_name;
  const firstName = fullName?.split(' ')[0] ?? (lang === 'ar' ? 'أحمد' : 'Ahmed');
  const faisal = personLabel(person('faisal'), lang);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const title = (id: StepId) => t(`steps.${id}.title`);
  const status = allDone ? t('allSet') : STEPS.length - n === 1 ? t('stepLeftOne') : t('stepsLeft', { n: formatNumber(STEPS.length - n, lang) });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <Hero overlap={30}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg }}>
            <View style={{ flex: 1, gap: 5, paddingTop: 6 }}>
              <AppText variant="small" color="onDarkMuted">
                {t('welcome', { name: firstName })}
              </AppText>
              <AppText variant="titleLg" color="onDark" style={{ fontSize: 27, lineHeight: 32 }}>
                {t('title')}
              </AppText>
            </View>
            <IconButton variant="glass" label={t('close')} onPress={close}>
              <X color={colors.onDark} size={20} strokeWidth={2} />
            </IconButton>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <HeroTile bg="primaryLight" icon={<Clock color={colors.onDark} size={14} strokeWidth={2.2} />} value={t('liveValue')} label={t('liveLabel')} />
            <HeroTile bg="orange" icon={<Hand color={colors.onDark} size={14} strokeWidth={2.2} />} value={t('trainingValue')} label={t('trainingLabel')} />
            <HeroTile bg="green" icon={<Banknote color={colors.onDark} size={14} strokeWidth={2.2} />} value={t('costValue')} label={t('costLabel')} />
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -30, gap: spacing.xxl }}>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${status} · ${t('earned', { earned: formatNumber(earned, lang), total: formatNumber(TOTAL_PTS, lang) })}`}
            accessibilityValue={{ min: 0, max: STEPS.length, now: n }}
            style={{ backgroundColor: colors.surface, borderRadius: radius.card, paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl, flexDirection: 'row', alignItems: 'center', gap: spacing.xl, boxShadow: shadows.raised }}
          >
            <View style={{ width: RING, height: RING }}>
              <Svg width={RING} height={RING} viewBox="0 0 64 64">
                <Defs>
                  <LinearGradient id="sqRing" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={gradients.avatarBlue[0]} />
                    <Stop offset="1" stopColor={gradients.avatarBlue[1]} />
                  </LinearGradient>
                </Defs>
                <Circle cx={32} cy={32} r={R} fill="none" stroke={colors.track} strokeWidth={7} />
                {n > 0 && (
                  <Circle
                    cx={32}
                    cy={32}
                    r={R}
                    fill="none"
                    stroke="url(#sqRing)"
                    strokeWidth={7}
                    strokeLinecap="round"
                    strokeDasharray={`${((CIRC * n) / STEPS.length).toFixed(1)} ${CIRC.toFixed(1)}`}
                    transform="rotate(-90 32 32)"
                  />
                )}
              </Svg>
              <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
                <AppText variant="lead" weight="extrabold" color="navy">
                  {t('progress', { n: formatNumber(n, lang), total: formatNumber(STEPS.length, lang) })}
                </AppText>
              </View>
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <AppText variant="lead" weight="extrabold">
                {status}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <PointsCoin size={20} />
                <AppText variant="caption" weight="bold" color="orangeText" numberOfLines={1}>
                  {t('earned', { earned: formatNumber(earned, lang), total: formatNumber(TOTAL_PTS, lang) })}
                </AppText>
              </View>
            </View>
          </View>

          <View>
            {STEPS.map((s, i) => {
              const on = !!done[s.id];
              const isNext = i === nextIdx;
              const last = i === STEPS.length - 1;
              const stepTitle = title(s.id);
              return (
                <View key={s.id} style={{ flexDirection: 'row', gap: spacing.lg }}>
                  <View style={{ width: 32, alignItems: 'center' }}>
                    {on ? (
                      <View style={{ marginTop: 13, width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.surface, overflow: 'hidden' }}>
                        <IconBadge size={28} gradient="avatarBlue" round>
                          <AppText variant="small" weight="extrabold" color="onDark">
                            ✓
                          </AppText>
                        </IconBadge>
                      </View>
                    ) : (
                      <View
                        style={{
                          marginTop: 13,
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          borderWidth: 2,
                          borderColor: isNext ? colors.primary : colors.border,
                          backgroundColor: isNext ? colors.primaryTint : colors.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <AppText variant="small" weight="extrabold" color={isNext ? 'primary' : 'textFaint'}>
                          {formatNumber(i + 1, lang)}
                        </AppText>
                      </View>
                    )}
                    <View style={{ width: 2, flex: 1, minHeight: 12, borderRadius: 1, backgroundColor: last ? colors.transparent : on ? colors.primary : colors.border }} />
                  </View>
                  <View style={{ flex: 1, paddingBottom: 7 }}>
                    <Pressable
                      onPress={() => setDone((d) => ({ ...d, [s.id]: !on }))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={t('stepA11y', { title: stepTitle, state: on ? t('stepDone') : t('stepTodo') })}
                      style={({ pressed }) => ({
                        minHeight: 56,
                        backgroundColor: isNext ? colors.primaryTint : colors.surface,
                        borderWidth: 1,
                        borderColor: isNext ? colors.borderDashed : colors.surface,
                        borderRadius: radius.tile,
                        paddingVertical: 9,
                        paddingHorizontal: spacing.md,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.md,
                        boxShadow: '0px 3px 12px rgba(11,42,91,0.05)',
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <IconBadge size={36} bg={s.tint}>
                        <s.Icon color={colors[s.ink]} size={18} strokeWidth={1.9} />
                      </IconBadge>
                      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                        <AppText variant="cardTitle" weight="bold" numberOfLines={1}>
                          {stepTitle}
                        </AppText>
                        <AppText variant="caption" color="textMuted" numberOfLines={1}>
                          {t(`steps.${s.id}.sub`, { name: faisal })}
                        </AppText>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.orangeTint, borderRadius: radius.pill, paddingVertical: 3, paddingStart: 3, paddingEnd: spacing.sm }}>
                        <PointsCoin size={16} />
                        <AppText variant="caption" weight="extrabold" color="orangeText">
                          {t('ptsPlus', { n: formatNumber(s.pts, lang) })}
                        </AppText>
                      </View>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.screen, paddingTop: spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.lg) + 4, backgroundColor: colors.bg, gap: 2 }}>
        <Button
          label={next ? t('next', { step: title(next.id) }) : t('goHome')}
          onPress={() => (next ? router.push(next.href) : router.replace('/'))}
        />
        <Pressable
          onPress={() => router.push('/36-how-to')}
          accessibilityRole="link"
          style={{ minHeight: sizes.touch, alignItems: 'center', justifyContent: 'center' }}
        >
          <AppText variant="small" weight="bold" color="primary">
            {t('stuck')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function HeroTile({ bg, icon, value, label }: { bg: ColorToken; icon: ReactNode; value: string; label: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.tile, paddingVertical: 9, paddingHorizontal: spacing.md, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: colors[bg], alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <AppText variant="stat" color="onDark" numberOfLines={1} style={{ flexShrink: 1 }}>
          {value}
        </AppText>
      </View>
      <AppText variant="micro" color="onDarkMuted" numberOfLines={2}>
        {label}
      </AppText>
    </View>
  );
}
