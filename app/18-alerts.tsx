// Screen 18 · Alerts — see design/v2/html/Alerts.dc.html (Arabic: AlertsAR.dc.html)
// Live data: notification_prefs (own row, RLS). Toggles save optimistically via src/features/alerts/useAlertPrefs.
// Recent alerts: table alerts (own rows; team-alerts, muntej-chat and DB triggers write them, the server pushes each once)
// via src/features/alerts/useAlerts, with "Mark all read". Value tiles: real counts for the last 7 days (useAlertStats).
import { Fragment, useState, type ComponentType } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  ArrowUp,
  BellOff,
  CalendarX,
  ClipboardCheck,
  Gavel,
  Inbox,
  MessageCircleQuestion,
  Siren,
  Target,
  Trophy,
  UserPlus,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  FileText,
  Gauge,
  Hand,
  Mail,
  MessageCircle,
  Moon,
  Rocket,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  TriangleAlert,
  Users,
  UserPen,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Button, Card, Hero, IconBadge, IconButton, SectionTitle, StatTile, Toggle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { featureUsed } from '@/features/launch/launch';
import { Spotlight } from '@/features/launch/Spotlight';
import { colors, radius, shadows, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { NS } from '@/features/alerts/strings';
import { ageParts } from '@/features/decisions/people';
import { useAlertStats, useRecentAlerts, type AlertItem, type AlertKind } from '@/features/alerts/useAlerts';
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

/** Risk alerts in red/amber, achievements in green. */
const ALERT_STYLE: Record<AlertKind, { Icon: ComponentType<LucideProps>; bg: ColorToken }> = {
  task_late: { Icon: Clock, bg: 'red' },
  task_at_risk: { Icon: TriangleAlert, bg: 'amberText' },
  overload: { Icon: Gauge, bg: 'amberText' },
  task_done_on_time: { Icon: CircleCheck, bg: 'green' },
  task_done_early: { Icon: Rocket, bg: 'green' },
  five_star: { Icon: Star, bg: 'green' },
  changed_for_you: { Icon: UserPen, bg: 'primary' },
  task_assigned: { Icon: UserPlus, bg: 'primary' },
  new_submission: { Icon: ClipboardCheck, bg: 'purple' },
  decision_waiting: { Icon: Gavel, bg: 'purple' },
  objective_achieved: { Icon: Trophy, bg: 'green' },
  objective_at_risk: { Icon: Target, bg: 'amberText' },
  objective_missed: { Icon: CalendarX, bg: 'red' },
  no_reply: { Icon: MessageCircleQuestion, bg: 'amberText' },
  escalated: { Icon: Siren, bg: 'red' },
  tool_sync: { Icon: ArrowLeftRight, bg: 'primary' },
  new_feature: { Icon: Sparkles, bg: 'purple' },
  request_answered: { Icon: CircleCheck, bg: 'green' },
  ladder_nudge: { Icon: Sparkles, bg: 'purple' },
};

function RecentAlerts() {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const { alerts, isLoading, isError, markRead, markAllRead, markingAll } = useRecentAlerts();
  const unread = (alerts ?? []).filter((a) => !a.read_at).length;

  const open = (a: AlertItem) => {
    if (!a.read_at) markRead(a.id);
    if (a.task_id) router.push({ pathname: '/14-task-detail', params: { id: a.task_id } });
    else if (a.kind === 'decision_waiting') router.push('/04-decisions');
  };

  return (
    <Card padding={spacing.xl} style={{ gap: spacing.sm }}>
      <SectionTitle title={t('recent')} actionLabel={unread > 0 && !markingAll ? t('markAll') : undefined} onAction={markAllRead} />
      {isLoading && <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} />}
      {isError && !alerts && (
        <AppText variant="small" color="red">
          {t('recentError')}
        </AppText>
      )}
      {alerts && alerts.length === 0 && (
        <AppText variant="small" color="textMuted">
          {t('recentEmpty')}
        </AppText>
      )}
      {alerts && alerts.length > 0 && (
        <View accessibilityLabel={t('recentLabel')}>
          {alerts.map((a, i) => {
            const st = ALERT_STYLE[a.kind] ?? ALERT_STYLE.task_at_risk;
            const ar = lang === 'ar';
            const title = ar && a.title_ar ? a.title_ar : a.title;
            const body = ar && a.body_ar ? a.body_ar : a.body;
            const age = ageParts(a.created_at);
            const ago = t(age.key, { n: formatNumber(age.n, lang) });
            const unread = !a.read_at;
            return (
              <Pressable
                key={a.id}
                onPress={() => open(a)}
                accessibilityRole={a.task_id ? 'link' : 'button'}
                accessibilityLabel={`${unread ? `${t('unread')}. ` : ''}${title}. ${body}. ${ago}`}
                accessibilityHint={a.task_id ? t('openHint') : undefined}
                style={({ pressed }) => ({
                  minHeight: 56,
                  paddingVertical: spacing.sm,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: spacing.md,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <IconBadge size={32} bg={st.bg}>
                  <st.Icon color={colors.onDark} size={16} strokeWidth={2} />
                </IconBadge>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <AppText weight={unread ? 'extrabold' : 'bold'} numberOfLines={1}>
                    {title}
                  </AppText>
                  <AppText variant="small" color="textMuted" numberOfLines={2}>
                    {body}
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6, paddingTop: 2 }}>
                  <AppText variant="micro" color="textFaint" numberOfLines={1}>
                    {ago}
                  </AppText>
                  {unread && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}

/** "Send me today's summary now": runs the daily-summary function for the signed-in user and says where it went. */
function SummaryTest() {
  const { t } = useScreenT(NS);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { data, error } = await supabase.functions.invoke<{ sent?: string[]; skipped?: string }>('daily-summary', { body: { test: true } });
      if (error || !data) throw error ?? new Error('no data');
      const sent = data.sent ?? [];
      featureUsed('daily_summary');
      setNote(
        data.skipped
          ? t('summaryNothing')
          : sent.length
            ? t('summarySent', { via: sent.map((c) => t(`via_${c}`)).join(' + ') })
            : t('summaryNone'),
      );
    } catch {
      setNote(t('summaryError'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <Button label={t('summaryTest')} variant="outline" size="md" loading={busy} onPress={run} />
      {note && (
        <AppText variant="small" color="textMuted" align="center">
          {note}
        </AppText>
      )}
    </View>
  );
}

export default function AlertsScreen() {
  const stats = useAlertStats();
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

  const qc = useQueryClient();
  const onRefresh = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ['alerts'] });
  };

  const esc = prefs?.escalation;
  const quietOn = !!prefs?.quiet_hours.enabled;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.primary} />}
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
          <RecentAlerts />

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
          {/* Static: the app can't see the server's WhatsApp setup, so this note always sits next to the toggle. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing.xs }}>
            <MessageCircle color={colors.textMuted} size={13} strokeWidth={2} />
            <AppText variant="micro" color="textMuted" style={{ flex: 1 }}>
              {t('waNote')}
            </AppText>
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

          {/* try the daily summary now (sent to you only, whatever the time) */}
          {prefs && (
            <Spotlight id="alerts.summary">
              <SummaryTest />
            </Spotlight>
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

          {/* Value tiles: real counts for the last 7 days */}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile
              icon={<BellOff color={colors.primary} size={15} strokeWidth={2} />}
              iconBg="primaryTint"
              value={t('pingsValue', { n: formatNumber(stats.data?.perDay ?? 0, lang, 1) })}
              label={t('pings')}
            />
            <StatTile
              icon={<Clock color={colors.green} size={15} strokeWidth={2} />}
              iconBg="greenTint"
              value={t('focusValue', { n: formatNumber(stats.data?.focusHours ?? 0, lang, 1) })}
              label={t('focus')}
            />
            <StatTile
              icon={<Hand color={colors.orange} size={15} strokeWidth={2} />}
              iconBg="orangeTint"
              value={formatNumber(stats.data?.chases ?? 0, lang)}
              label={t('chases')}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
