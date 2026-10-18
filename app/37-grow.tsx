// Screen 37 · Grow — see design/v2/html/Grow.dc.html (Arabic: GrowAR.dc.html)
// Demo data: growth stats, the AI-spotted branch, invites and referrals have no backend yet (local state only).
// Tip t37: invite the Jeddah manager (→ invited state), then share the receipt (React Native Share sheet / Receipt screen).
import { useState, type ComponentType } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { G, Path } from 'react-native-svg';
import { ArrowLeft, Banknote, Building2, Check, Clock, Gift, MapPin, Plus, Receipt, Sparkles, UserPlus, Users, type LucideProps } from 'lucide-react-native';
import { AppText, Button, Card, Gradient, Hero, IconBadge, IconButton, StatTile } from '@/components/ui';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { GROW_ACTIONS, GROW_STATS, RECEIPT_SUMMARY, SPOTTED_BRANCH, type GrowAction } from '@/features/grow/demo';
import { NS } from '@/features/grow/strings';

type Branch = 'ask' | 'sent' | 'hidden';

const ACTION_ICONS: Record<GrowAction['icon'], ComponentType<LucideProps>> = { plus: Plus, userPlus: UserPlus, receipt: Receipt };
const OVERLAP = 22;

export default function GrowScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const [branch, setBranch] = useState<Branch>('ask');
  const [referred, setReferred] = useState(false);

  const n = (v: number) => formatNumber(v, lang);
  const city = t(SPOTTED_BRANCH.cityKey);

  const shareReceipt = async () => {
    try {
      const res = await Share.share({ message: t('shareMessage', { h: n(RECEIPT_SUMMARY.hours), sar: n(RECEIPT_SUMMARY.sar) }) });
      if (res.action === Share.sharedAction) setReferred(true);
    } catch {
      // share sheet unavailable (e.g. web without navigator.share) — leave the button as is
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.lg }} showsVerticalScrollIndicator={false}>
        <Hero overlap={OVERLAP}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <IconButton variant="glass" label={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
              <ArrowLeft color={colors.onDark} size={20} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
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
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
            <StatTile
              variant="glass"
              iconBg="primaryLight"
              icon={<Building2 color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={n(GROW_STATS.teamsLive + (branch === 'sent' ? 1 : 0))}
              label={t('teamsLive')}
            />
            <StatTile variant="glass" iconBg="purple" icon={<Users color={colors.onDark} size={14} strokeWidth={2.2} />} value={n(GROW_STATS.peopleActive)} label={t('peopleActive')} />
            <StatTile variant="glass" iconBg="green" icon={<Check color={colors.onDark} size={14} strokeWidth={2.2} />} value={`${n(GROW_STATS.selfJoinedPct)}%`} label={t('selfJoined')} />
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -OVERLAP, gap: spacing.xl }}>
          {/* AI-spotted branch */}
          {branch === 'ask' && (
            <Card elevation="raised" padding={spacing.xl} style={{ gap: spacing.md, paddingHorizontal: spacing.xxl, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', start: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.primary }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <IconBadge size={22} bg="primaryTint">
                  <Sparkles color={colors.primary} fill={colors.primary} size={13} strokeWidth={1.5} />
                </IconBadge>
                <AppText variant="caption" weight="extrabold" color="primary">
                  {t('noticed')}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <IconBadge size={40} bg="amberTint">
                  <MapPin color={colors.amberText} size={20} strokeWidth={1.9} />
                </IconBadge>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="cardTitle" weight="extrabold">
                    {t('branch', { city, n: n(SPOTTED_BRANCH.tasks) })}
                  </AppText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryTint, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                      <Clock color={colors.primary} size={11} strokeWidth={2.6} />
                      <AppText variant="micro" weight="extrabold" color="primary">
                        {t('hoursMonth', { n: n(SPOTTED_BRANCH.hoursPerMonth) })}
                      </AppText>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                      <Banknote color={colors.green} size={11} strokeWidth={2.6} />
                      <AppText variant="micro" weight="extrabold" color="greenText">
                        {t('sar', { n: n(SPOTTED_BRANCH.sarPerMonth) })}
                      </AppText>
                    </View>
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                <Button size="md" label={t('inviteBranch', { city })} onPress={() => setBranch('sent')} />
                <Button size="md" variant="outline" label={t('notNow')} onPress={() => setBranch('hidden')} />
              </View>
            </Card>
          )}
          {branch === 'sent' && (
            <View
              accessibilityLiveRegion="polite"
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.greenTint, borderRadius: radius.card, paddingVertical: spacing.xl, paddingHorizontal: spacing.xxl, boxShadow: shadows.raised }}
            >
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                <Check color={colors.onDark} size={12} strokeWidth={3.2} />
              </View>
              <AppText weight="bold" color="greenText" style={{ flex: 1, lineHeight: 20 }}>
                {t('invited', { name: t(SPOTTED_BRANCH.managerKey), city })}
              </AppText>
            </View>
          )}

          {/* Grow actions */}
          <View style={{ gap: spacing.sm }}>
            {GROW_ACTIONS.map((a) => {
              const Icon = ACTION_ICONS[a.icon];
              return (
                <Card
                  key={a.key}
                  onPress={() => router.push(a.route)}
                  accessibilityLabel={`${t(a.key)}, ${t(`${a.key}_sub`)}`}
                  padding={spacing.md}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, borderRadius: radius.button, minHeight: 62 }}
                >
                  <IconBadge size={40} bg={a.tint}>
                    <Icon color={colors[a.ink]} size={20} strokeWidth={1.9} />
                  </IconBadge>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="cardTitle" weight="bold">
                      {t(a.key)}
                    </AppText>
                    <AppText variant="caption" color="textMuted">
                      {t(`${a.key}_sub`)}
                    </AppText>
                  </View>
                  <View style={{ backgroundColor: colors.orangeTint, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 }}>
                    <AppText variant="caption" weight="extrabold" color="orangeText" numberOfLines={1}>
                      {t(`${a.key}_reward`)}
                    </AppText>
                  </View>
                </Card>
              );
            })}
          </View>

          {/* Give a month referral */}
          <View style={{ borderRadius: radius.cardLg, boxShadow: shadows.primary }}>
            <Gradient name="heroManager" style={{ borderRadius: radius.cardLg, padding: spacing.xxl, gap: spacing.sm, overflow: 'hidden' }}>
              <Svg
                width={120}
                height={120}
                viewBox="0 0 150 150"
                pointerEvents="none"
                style={{ position: 'absolute', top: -18, opacity: 0.16, ...(isRTL ? { left: -24 } : { right: -24 }) }}
              >
                <G fill="none" stroke={colors.onDark} strokeWidth={2}>
                  <Path d="M0 40l25-25 25 25 25-25 25 25 25-25 25 25" />
                  <Path d="M0 70l25-25 25 25 25-25 25 25 25-25 25 25" />
                  <Path d="M0 100l25-25 25 25 25-25 25 25 25-25 25 25" />
                </G>
              </Svg>
              <AppText variant="stat" display color="onDark" style={{ lineHeight: 24 }}>
                {t('referTitle')}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <GlassChip bg="orange" Icon={Gift} label={t('freeMonth')} />
                <GlassChip bg="green" Icon={Receipt} label={t('sendsReceipt')} />
              </View>
              <Pressable
                onPress={shareReceipt}
                accessibilityRole="button"
                accessibilityLabel={referred ? t('shared') : t('share')}
                style={({ pressed }) => ({
                  marginTop: 2,
                  minHeight: 46,
                  borderRadius: radius.pill,
                  backgroundColor: referred ? colors.greenTint : colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: spacing.xxl,
                  boxShadow: shadows.raised,
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <AppText weight="extrabold" color={referred ? 'greenText' : 'primary'}>
                  {referred ? t('shared') : t('share')}
                </AppText>
              </Pressable>
            </Gradient>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function GlassChip({ bg, Icon, label }: { bg: 'orange' | 'green'; Icon: ComponentType<LucideProps>; label: string }) {
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
        paddingVertical: 4,
        paddingStart: 5,
        paddingEnd: spacing.md,
      }}
    >
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors[bg], alignItems: 'center', justifyContent: 'center' }}>
        <Icon color={colors.onDark} size={11} strokeWidth={2.6} />
      </View>
      <AppText variant="caption" weight="bold" color="onDark">
        {label}
      </AppText>
    </View>
  );
}
