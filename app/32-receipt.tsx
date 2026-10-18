// Screen 32 · Weekly receipt — see design/v2/html/Receipt.dc.html (Arabic: ReceiptAR.dc.html)
// Live data: activity_log counts for this week/month (+ followups totals via useHomeStats). Demo numbers only
// when the workspace has no activity yet. Hours from value.ts; SAR = hours × the rate the user picks.
import { useState, type ComponentType, type ReactNode } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import {
  Award,
  Banknote,
  ChevronLeft,
  Clock,
  Hand,
  Lightbulb,
  MessageSquareText,
  ReceiptText,
  Send,
  SquareCheck,
  Upload,
  Users,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Button, Card, Gradient, Hero, IconBadge, IconButton } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken, type GradientToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { NS } from '@/features/receipt/strings';
import { periodStart, useReceipt, type Period, type ReceiptCounts } from '@/features/receipt/useReceipt';

const RATES = [100, 150, 200, 250, 300, 400];
const DEFAULT_RATE = 200;

const LINES: { key: Exclude<keyof ReceiptCounts, 'chases'>; Icon: ComponentType<LucideProps>; bg: ColorToken; fg: ColorToken }[] = [
  { key: 'followups', Icon: Send, bg: 'primaryTint', fg: 'primary' },
  { key: 'updates', Icon: MessageSquareText, bg: 'purpleTint', fg: 'purple' },
  { key: 'promises', Icon: SquareCheck, bg: 'greenTint', fg: 'green' },
  { key: 'decisions', Icon: Lightbulb, bg: 'amberTint', fg: 'amberText' },
];

// Zig-zag torn-paper edge, 346 × 10 like the design; stretched to the card width.
const ZIG_TOP = (() => {
  let d = 'M0 10 L0 5';
  for (let x = 8, up = true; x <= 336; x += 8, up = !up) d += ` L${x} ${up ? 0 : 5}`;
  return `${d} L346 0 L346 10 Z`;
})();
const ZIG_BOTTOM = (() => {
  let d = 'M0 0 L0 5';
  for (let x = 8, down = true; x <= 336; x += 8, down = !down) d += ` L${x} ${down ? 10 : 5}`;
  return `${d} L346 10 L346 0 Z`;
})();

export default function ReceiptScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('week');
  const [rate, setRate] = useState(DEFAULT_RATE);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const r = useReceipt(period, rate);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const locale = lang === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-US';
  const fmt = (n: number) => formatNumber(n, lang);

  // Week = Sunday → Thursday (Saudi work week); month = month name.
  const start = periodStart('week');
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  const sameMonth = start.getMonth() === end.getMonth();
  const mon = (d: Date, style: 'short' | 'long') => new Intl.DateTimeFormat(locale, { month: style }).format(d);
  const range =
    lang === 'ar'
      ? sameMonth
        ? `${start.getDate()}–${end.getDate()} ${mon(end, 'long')}`
        : `${start.getDate()} ${mon(start, 'long')} – ${end.getDate()} ${mon(end, 'long')}`
      : sameMonth
        ? `${mon(start, 'short')} ${start.getDate()}–${end.getDate()}`
        : `${mon(start, 'short')} ${start.getDate()} – ${mon(end, 'short')} ${end.getDate()}`;
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date());
  const periodLabel = period === 'week' ? range : monthLabel;

  const managerName = (lang === 'ar' ? r.managerNameAr : null) ?? r.managerName ?? (lang === 'ar' ? 'أحمد' : 'Ahmed');
  const teamLabel = t('team', { name: managerName, n: fmt(r.teamSize ?? 8) });
  const hoursText = formatNumber(r.hours, lang, 1);
  const sarText = fmt(r.sar);

  const share = async () => {
    try {
      await Share.share({
        message: t('shareText', {
          team: managerName,
          period: periodLabel,
          followups: fmt(r.counts.followups),
          updates: fmt(r.counts.updates),
          promises: fmt(r.counts.promises),
          decisions: fmt(r.counts.decisions),
          hours: hoursText,
          sar: sarText,
          rate: fmt(rate),
          chases: fmt(r.counts.chases),
        }),
      });
      setShared(true);
    } catch {
      // share sheet dismissed / unavailable
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 150 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <Hero overlap={30}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <IconButton variant="glass" label={t('back')} onPress={back}>
              <ChevronLeft color={colors.onDark} size={20} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </IconButton>
            <View style={{ flex: 1 }}>
              <AppText variant="big" display color="onDark">
                {t('title')}
              </AppText>
              <AppText variant="small" color="onDarkMuted">
                {period === 'week' ? t('subtitleWeek', { range }) : t('subtitleMonth', { month: monthLabel })}
              </AppText>
            </View>
          </View>
          <View
            accessibilityRole="tablist"
            style={{ flexDirection: 'row', gap: 4, padding: 3, marginTop: 2, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill }}
          >
            {(['week', 'month'] as Period[]).map((p) => {
              const on = period === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => {
                    setPeriod(p);
                    setShared(false);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  hitSlop={{ top: 4, bottom: 4 }}
                  style={{ flex: 1, minHeight: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.surface : colors.transparent }}
                >
                  <AppText weight="bold" color={on ? 'primary' : 'onDark'}>
                    {t(p)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -22, gap: spacing.screen }}>
          {/* receipt paper */}
          <View style={{ marginTop: 9, marginBottom: 9 }}>
            <Svg width="100%" height={10} viewBox="0 0 346 10" preserveAspectRatio="none" style={{ position: 'absolute', top: -9, left: 0, right: 0 }}>
              <Path d={ZIG_TOP} fill={colors.surface} />
            </Svg>
            <View style={{ backgroundColor: colors.surface, borderRadius: 4, paddingTop: 18, paddingHorizontal: 20, paddingBottom: spacing.xxl, boxShadow: '0px 14px 30px rgba(11,42,91,0.14)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingBottom: spacing.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <IconBadge size={28} gradient="heroManager">
                    <ReceiptText color={colors.onDark} size={15} strokeWidth={2.2} />
                  </IconBadge>
                  <AppText variant="stat" display>
                    {t('brand')}
                  </AppText>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, backgroundColor: colors.purpleTint, borderRadius: radius.pill, paddingVertical: 4, paddingStart: 6, paddingEnd: spacing.md }}>
                  <Users color={colors.purple} size={14} strokeWidth={2} />
                  <AppText variant="caption" weight="bold" color="purple" numberOfLines={1}>
                    {teamLabel}
                  </AppText>
                </View>
              </View>
              <Dashed />

              <View style={{ flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xl, paddingBottom: spacing.lg }}>
                <BigStat bg="primaryTint" gradient="avatarBlue" icon={<Clock color={colors.onDark} size={22} strokeWidth={2} />} cap={t('hoursCap')} value={hoursText} valueColor="primary" label={t('hoursLabel')} />
                <BigStat bg="greenTint" gradient="success" icon={<Banknote color={colors.onDark} size={22} strokeWidth={2} />} cap={t('sarCap')} value={sarText} valueColor="green" label={t('sarLabel')} />
                <BigStat bg="orangeTint" gradient="avatarOrange" icon={<Hand color={colors.onDark} size={22} strokeWidth={2} />} cap={t('chasesCap')} value={fmt(r.counts.chases)} valueColor="orange" label={t('chasesLabel')} />
              </View>
              <Dashed />

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm, paddingTop: spacing.lg, paddingBottom: 2 }}>
                {LINES.map((l) => (
                  <View key={l.key} style={{ width: '50%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingEnd: spacing.sm }}>
                    <IconBadge size={30} bg={l.bg}>
                      <l.Icon color={colors[l.fg]} size={16} strokeWidth={2} />
                    </IconBadge>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="lead" weight="extrabold" style={{ fontVariant: ['tabular-nums'] }}>
                        {fmt(r.counts[l.key])}
                      </AppText>
                      <AppText variant="micro" color="textMuted" numberOfLines={1}>
                        {t(`lines.${l.key}`)}
                      </AppText>
                    </View>
                  </View>
                ))}
              </View>

              <Pressable
                onPress={() => setRatesOpen((o) => !o)}
                accessibilityRole="button"
                accessibilityLabel={t('rateA11y', { rate: fmt(rate) })}
                accessibilityState={{ expanded: ratesOpen }}
                style={{ minHeight: sizes.touch, justifyContent: 'center', marginTop: 2, marginBottom: -spacing.md }}
              >
                <AppText variant="micro" color={ratesOpen ? 'primary' : 'textFaint'} align="center">
                  {t('rate', { rate: fmt(rate) })}
                </AppText>
              </Pressable>
              {ratesOpen && (
                <View style={{ gap: spacing.sm, paddingTop: spacing.md }}>
                  <AppText variant="caption" weight="bold" color="textMuted" align="center">
                    {t('rateTitle')}
                  </AppText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
                    {RATES.map((v) => {
                      const on = v === rate;
                      return (
                        <Pressable
                          key={v}
                          onPress={() => {
                            setRate(v);
                            setRatesOpen(false);
                            setShared(false);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          hitSlop={{ top: 4, bottom: 4 }}
                          style={{ minHeight: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, justifyContent: 'center', borderWidth: 1, borderColor: on ? colors.primary : colors.borderBlue, backgroundColor: on ? colors.primaryTint : colors.surface }}
                        >
                          <AppText variant="small" weight="bold" color={on ? 'primary' : 'text'}>
                            {t('rateOption', { rate: fmt(v) })}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
              {!r.live && !r.loading && (
                <AppText variant="micro" color="textFaint" align="center" style={{ paddingTop: spacing.md }}>
                  {t('demo')}
                </AppText>
              )}
            </View>
            <Svg width="100%" height={10} viewBox="0 0 346 10" preserveAspectRatio="none" style={{ position: 'absolute', bottom: -9, left: 0, right: 0 }}>
              <Path d={ZIG_BOTTOM} fill={colors.surface} />
            </Svg>
          </View>

          <Card tone="amber" padding={0} style={{ borderRadius: radius.button, borderWidth: 1, borderColor: colors.gold, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <IconBadge size={40} gradient="warning">
              <Award color={colors.onDark} size={20} strokeWidth={2} />
            </IconBadge>
            <View style={{ flex: 1 }}>
              <AppText weight="bold" color="amberStrong">
                {t('founding')}
              </AppText>
              <AppText variant="caption" color="amberStrong">
                {t('foundingSub')}
              </AppText>
            </View>
          </Card>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.screen, paddingTop: spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.xxl) + 6, backgroundColor: colors.bg, gap: spacing.sm }}>
        <Button
          label={shared ? t('shared') : t('share')}
          onPress={share}
          icon={<Upload color={colors.onDark} size={18} strokeWidth={2} />}
        />
        <AppText variant="caption" color="textMuted" align="center">
          {t('shareHint')}
        </AppText>
      </View>
    </View>
  );
}

function Dashed() {
  return <View style={{ height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderBlue }} />;
}

function BigStat({
  bg,
  gradient,
  icon,
  cap,
  value,
  valueColor,
  label,
}: {
  bg: ColorToken;
  gradient: GradientToken;
  icon: ReactNode;
  cap: string;
  value: string;
  valueColor: ColorToken;
  label: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: colors[bg], borderRadius: radius.tile, paddingTop: spacing.lg, paddingBottom: spacing.md, paddingHorizontal: spacing.sm, alignItems: 'center', gap: 4 }}>
      <Gradient name={gradient} style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </Gradient>
      <AppText variant="micro" weight="bold" color="textMuted" style={{ marginTop: 2 }}>
        {cap}
      </AppText>
      <AppText weight="extrabold" color={valueColor} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 30, lineHeight: 34, letterSpacing: -0.5 }}>
        {value}
      </AppText>
      <AppText variant="micro" color="textMuted" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}
