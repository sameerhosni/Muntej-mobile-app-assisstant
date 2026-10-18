// Screen 01 · Manager Home — see design/v2/html/Main.dc.html (Arabic: MainAR.dc.html)
import type { ComponentType } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Redirect, router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Banknote, ChevronRight, Clock, Hand, Keyboard, Receipt, type LucideProps } from 'lucide-react-native';
import { AppText, Avatar, Card, Gradient, Hero, IconBadge, SectionTitle, StatTile } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useHomeStats, useMyProfile, usePendingDecisionCount } from '@/lib/api';
import { formatNumber, hoursSaved, sarSaved } from '@/features/home/value';

function greetingKey(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'home.morning' : h < 18 ? 'home.afternoon' : 'home.evening';
}

export default function ManagerHome() {
  const { t } = useTranslation();
  const { lang, isRTL } = useDirection();
  const me = useMyProfile();
  const stats = useHomeStats();
  const pending = usePendingDecisionCount();

  if (me.data?.role === 'employee') return <Redirect href="/25-employee-home" />;

  const firstName = (lang === 'ar' && me.data?.full_name_ar ? me.data.full_name_ar : me.data?.full_name ?? '').split(' ')[0];
  const s = stats.data;
  const hours = s ? hoursSaved(s.followupsSent, s.updatesReceived) : null;
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={stats.isRefetching} onRefresh={() => stats.refetch()} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        <Hero overlap={22}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ gap: 2, flexShrink: 1 }}>
              <AppText color="onDarkMuted">{t(greetingKey())}</AppText>
              <AppText variant="titleLg" color="onDark" numberOfLines={1}>
                {firstName || ' '}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: colors.glass,
                  borderWidth: 1,
                  borderColor: colors.glassBorder,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 6,
                  borderRadius: radius.pill,
                }}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.mint }} />
                <AppText variant="caption" weight="bold" color="onDark">
                  {t('home.muntejOn')}
                </AppText>
              </View>
              <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={t('settings.open')}>
                <Avatar name={me.data?.full_name ?? '?'} size={42} gradient="avatarOrange" ring />
              </Pressable>
            </View>
          </View>

          <View style={{ gap: 2, marginTop: 6 }}>
            <AppText color="onDarkMuted">{t('home.handlingNow')}</AppText>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.md }}>
              <AppText variant="hero" color="onDark" style={{ lineHeight: 64 }}>
                {s ? formatNumber(s.handling, lang) : '–'}
              </AppText>
              <AppText variant="title" color="onDark" style={{ fontSize: 19 }}>
                {t('home.tasksForYou')}
              </AppText>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile variant="glass" iconBg="primaryLight" icon={<Clock color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={hours === null ? '–' : formatNumber(hours, lang, 1)} label={t('home.hoursSaved')} />
            <StatTile variant="glass" iconBg="green" icon={<Banknote color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={hours === null ? '–' : formatNumber(sarSaved(hours), lang)} label={t('home.sarSaved')} />
            <StatTile variant="glass" iconBg="orange" icon={<Hand color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={s ? formatNumber(s.timesAsked, lang) : '–'} label={t('home.chasesNeeded')} />
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, gap: spacing.xxl + 2, marginTop: -22 }}>
          {pending > 0 && (
            <Card
              elevation="raised"
              padding={spacing.lg}
              onPress={() => router.push('/04-decisions')}
              accessibilityLabel={t('home.decisionsTitle', { count: pending })}
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              <Gradient name="warning" style={{ width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}>
                <AppText variant="stat" color="onDark">
                  {formatNumber(pending, lang)}
                </AppText>
              </Gradient>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="cardTitle">{t('home.decisionsTitle', { count: pending })}</AppText>
                <AppText variant="caption" color="textMuted">
                  {t('home.decisionsSub')}
                </AppText>
              </View>
              <IconBadge size={32} bg="amberTint" round>
                <ChevronRight color={colors.amberText} size={16} strokeWidth={2.2} style={flip} />
              </IconBadge>
            </Card>
          )}

          <View style={{ gap: spacing.md }}>
            <SectionTitle title={t('home.askMuntej')} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -spacing.screen }}
              contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingVertical: 2, gap: spacing.sm }}
            >
              <AskChip label={t('home.askLate')} Icon={Clock} bg="redTint" fg="red" href="/04-decisions" />
              <AskChip label={t('home.askRisk')} Icon={AlertTriangle} bg="amberTint" fg="amberText" href="/24-roadmap" />
              <AskChip label={t('home.askReceipt')} Icon={Receipt} bg="greenTint" fg="green" href="/32-receipt" />
            </ScrollView>
          </View>

          <View
            style={{
              minHeight: 56,
              borderRadius: radius.button,
              backgroundColor: colors.surface,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: colors.borderDashed,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Pressable
              onPress={() => router.push({ pathname: '/02-capture', params: { mode: 'voice' } })}
              accessibilityRole="button"
              accessibilityLabel={t('home.sayBar')}
              style={{ flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xxl }}
            >
              <WaveGlyph />
              <AppText color="textMuted">{t('home.sayBar')}</AppText>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/02-capture', params: { mode: 'text' } })}
              accessibilityRole="button"
              accessibilityLabel={t('home.typeInsteadLabel')}
              style={{ width: sizes.touch + 8, minHeight: 56, alignItems: 'center', justifyContent: 'center' }}
            >
              <Keyboard color={colors.primary} size={20} strokeWidth={1.9} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function AskChip({
  label,
  Icon,
  bg,
  fg,
  href,
}: {
  label: string;
  Icon: ComponentType<LucideProps>;
  bg: ColorToken;
  fg: ColorToken;
  href: Href;
}) {
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: sizes.touch - 6,
        paddingStart: 6,
        paddingEnd: spacing.lg,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        boxShadow: shadows.tile,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <IconBadge size={26} bg={bg} round>
        <Icon color={colors[fg]} size={14} strokeWidth={2.2} />
      </IconBadge>
      <AppText variant="small" weight="semibold">
        {label}
      </AppText>
    </Pressable>
  );
}

/** Static blue voice bars from the "Say a task" bar. */
function WaveGlyph() {
  const bars = [4, 10, 16, 8, 14, 6, 10, 4];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 20, direction: 'ltr' }} accessibilityElementsHidden>
      {bars.map((h, i) => (
        <View key={i} style={{ width: 2.4, height: h, borderRadius: 1.2, backgroundColor: colors.primary }} />
      ))}
    </View>
  );
}
