// Screen 18 · Alerts — see design/v2/html/Alerts.dc.html (Arabic: AlertsAR.dc.html)
// Live data: notification_prefs (own row, RLS). Toggles save optimistically via src/features/alerts/useAlertPrefs.
import { Fragment, type ComponentType } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  ArrowUp,
  BellOff,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  FileText,
  Hand,
  Mail,
  MessageCircle,
  Moon,
  Smartphone,
  Star,
  Sun,
  TriangleAlert,
  Users,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Card, Hero, IconBadge, IconButton, StatTile, Toggle } from '@/components/ui';
import { colors, radius, shadows, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { NS } from '@/features/alerts/strings';
import { CHANNELS, RULE_KEYS, useAlertPrefs, type Channel, type Rule, type RuleKey } from '@/features/alerts/useAlertPrefs';

const CHANNEL_ICON: Record<Channel, ComponentType<LucideProps>> = {
  push: Smartphone,
  email: Mail,
  whatsapp: MessageCircle,
  teams: Users,
};

/** Channels that can't be switched on yet (Teams ships later). */
const COMING_LATER: Channel[] = ['teams'];

const RULE_STYLE: Record<RuleKey, { Icon: ComponentType<LucideProps>; bg: ColorToken }> = {
  task_at_risk: { Icon: TriangleAlert, bg: 'red' },
  task_overdue: { Icon: Clock, bg: 'red' },
  decision_waiting: { Icon: CircleCheck, bg: 'amberText' },
  new_submission: { Icon: FileText, bg: 'amberText' },
  kudos: { Icon: Star, bg: 'orange' },
  daily_summary: { Icon: Sun, bg: 'primary' },
  weekly_report: { Icon: ChartColumn, bg: 'purple' },
};

export default function AlertsScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const { prefs, isLoading, isError, isRefetching, refetch, saveError, toggleChannel, toggleRule, toggleQuietHours } =
    useAlertPrefs();

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  /** "16:00" → "4 PM" / "4 العصر"; "21:00" → "9 PM" / "9 بالليل". */
  const fmtTime = (hhmm: string | undefined) => {
    const h24 = Number((hhmm ?? '0').split(':')[0]) || 0;
    const h = formatNumber(h24 % 12 === 0 ? 12 : h24 % 12, lang);
    return t(h24 < 12 ? 'am' : h24 < 18 ? 'pm' : 'night', { h });
  };

  const viaLine = (r: Rule) => {
    const chans = r.channels.map((c) => t(`via.${c}`)).join(' + ');
    let when: string | null = null;
    if (r.day) when = `${t(`days.${r.day}`)} ${fmtTime(r.time)}`;
    else if (r.time) when = fmtTime(r.time);
    else if (r.timing === 'instant') when = t('now');
    return when ? `${chans} · ${when}` : chans;
  };

  const esc = prefs?.escalation;
  const quietOn = !!prefs?.quiet_hours.enabled;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
      >
        <Hero overlap={40}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg }}>
            <IconButton variant="glass" label={t('back')} onPress={goBack}>
              <BackIcon color={colors.onDark} size={22} strokeWidth={2} />
            </IconButton>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="titleLg" color="onDark" style={{ fontSize: 28, lineHeight: 34 }}>
                {t('title')}
              </AppText>
              <AppText color="onDarkMuted">{t('subtitle')}</AppText>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 3, marginTop: 4 }}>
              <AppText weight="extrabold" color="onDark" style={{ fontSize: 30, lineHeight: 32 }}>
                {formatNumber(80, lang)}%
              </AppText>
              <View
                style={{
                  backgroundColor: colors.glass,
                  borderWidth: 1,
                  borderColor: colors.mint,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 2,
                }}
              >
                <AppText variant="micro" weight="bold" color="onDark" numberOfLines={1}>
                  {t('fewer')}
                </AppText>
              </View>
            </View>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -40, gap: spacing.md }}>
          {/* Channels */}
          <View accessibilityLabel={t('channelsLabel')} style={{ flexDirection: 'row', gap: spacing.sm }}>
            {CHANNELS.map((c) => {
              const later = COMING_LATER.includes(c);
              const on = !later && !!prefs?.channels[c];
              const Icon = CHANNEL_ICON[c];
              const fg: ColorToken = on ? 'primary' : 'textFaint';
              return (
                <Pressable
                  key={c}
                  onPress={() => toggleChannel(c)}
                  disabled={!prefs || later}
                  accessibilityRole="switch"
                  accessibilityLabel={t(`ch.${c}`)}
                  accessibilityState={{ checked: on, disabled: !prefs || later }}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 76,
                    borderRadius: radius.button,
                    borderWidth: 1.5,
                    borderStyle: on ? 'solid' : 'dashed',
                    borderColor: on ? colors.primary : colors.borderBlue,
                    backgroundColor: on ? colors.surface : colors.surfaceMuted,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    boxShadow: shadows.raised,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Icon color={colors[fg]} size={18} strokeWidth={1.9} />
                  <AppText variant="small" weight="bold" color={fg} numberOfLines={1}>
                    {t(`ch.${c}`)}
                  </AppText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors[fg] }} />
                    <AppText variant="micro" weight="bold" color={fg}>
                      {later ? t('soon') : on ? t('on') : t('off')}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {isLoading && (
            <Card style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.md }}>
              <ActivityIndicator color={colors.primary} />
              <AppText color="textMuted">{t('loading')}</AppText>
            </Card>
          )}
          {isError && !prefs && (
            <Card tone="red">
              <AppText color="red">{t('error')}</AppText>
            </Card>
          )}
          {saveError && (
            <Card tone="amber" padding={spacing.lg}>
              <AppText variant="small" color="amberStrong">
                {t('saveError')}
              </AppText>
            </Card>
          )}

          {/* Rules */}
          {prefs && (
            <Card padding={spacing.xl} style={{ paddingVertical: 2, gap: 0 }}>
              <View accessibilityLabel={t('rulesLabel')}>
                {RULE_KEYS.map((k, i) => {
                  const r = prefs.rules[k];
                  const st = RULE_STYLE[k];
                  return (
                    <View
                      key={k}
                      style={{
                        minHeight: 52,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.lg,
                        borderBottomWidth: i === RULE_KEYS.length - 1 ? 0 : 1,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <IconBadge size={32} bg={st.bg}>
                        <st.Icon color={colors.onDark} size={16} strokeWidth={2} />
                      </IconBadge>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText weight="bold" numberOfLines={1}>
                          {t(`rule.${k}`)}
                        </AppText>
                        <AppText variant="micro" color="textMuted" numberOfLines={1}>
                          {viaLine(r)}
                        </AppText>
                      </View>
                      <Toggle value={r.enabled} onValueChange={() => toggleRule(k)} accessibilityLabel={t(`rule.${k}`)} />
                    </View>
                  );
                })}
              </View>
            </Card>
          )}

          {/* Quiet hours + escalation */}
          {prefs && esc && (
            <Card padding={spacing.xl} style={{ paddingVertical: 0, gap: 0, borderRadius: radius.button }}>
              <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <IconBadge size={32} bg="purpleTint">
                  <Moon color={colors.purple} size={17} strokeWidth={1.9} />
                </IconBadge>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText weight="bold">{t('quiet')}</AppText>
                  <AppText variant="micro" color="textMuted">
                    {t('quietDetail', { time: fmtTime(prefs.quiet_hours.after) })}
                  </AppText>
                </View>
                <Pressable
                  onPress={toggleQuietHours}
                  accessibilityRole="switch"
                  accessibilityLabel={t('quietToggle')}
                  accessibilityState={{ checked: quietOn }}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                  style={{
                    backgroundColor: quietOn ? colors.purpleTint : colors.chip,
                    borderRadius: radius.pill,
                    paddingHorizontal: spacing.md,
                    paddingVertical: 4,
                    minWidth: 48,
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="caption" weight="extrabold" color={quietOn ? 'purple' : 'textMuted'}>
                    {quietOn ? t('on') : t('off')}
                  </AppText>
                </Pressable>
              </View>
              <View
                accessible
                accessibilityLabel={t('escHint', { h: esc.no_reply_hours, n: esc.reminders })}
                style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}
              >
                <IconBadge size={32} gradient="warning">
                  <ArrowUp color={colors.onDark} size={17} strokeWidth={2.2} />
                </IconBadge>
                <AppText weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                  {t('escalate')}
                </AppText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {[
                    t('escHours', { n: formatNumber(esc.no_reply_hours, lang) }),
                    esc.reminders === 2 ? t('escNudges2') : t('escNudges', { n: formatNumber(esc.reminders, lang) }),
                    t('escYou'),
                  ].map((label, i) => (
                    <Fragment key={label}>
                      {i > 0 && <Chevron color={colors.amberText} size={12} strokeWidth={2.4} />}
                      <View style={{ backgroundColor: colors.amberTint, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 3 }}>
                        <AppText variant="micro" weight="bold" color="amberStrong">
                          {label}
                        </AppText>
                      </View>
                    </Fragment>
                  ))}
                </View>
              </View>
            </Card>
          )}

          {/* Value tiles (demo figures from the design) */}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile
              icon={<BellOff color={colors.primary} size={15} strokeWidth={2} />}
              iconBg="primaryTint"
              value={t('pingsValue', { n: formatNumber(4, lang) })}
              label={t('pings')}
            />
            <StatTile
              icon={<Clock color={colors.green} size={15} strokeWidth={2} />}
              iconBg="greenTint"
              value={t('focusValue', { n: formatNumber(1.5, lang, 1) })}
              label={t('focus')}
            />
            <StatTile
              icon={<Hand color={colors.orange} size={15} strokeWidth={2} />}
              iconBg="orangeTint"
              value={formatNumber(0, lang)}
              label={t('chases')}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
