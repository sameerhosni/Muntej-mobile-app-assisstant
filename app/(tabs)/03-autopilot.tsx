// Screen 03 · Autopilot — see design/v2/html/Autopilot.dc.html (Arabic: AutopilotAR.dc.html)
// Live data: activity_log (RLS-scoped). Read-only feed of what Muntej did.
import { useMemo, useState, type ComponentType } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  CalendarCheck,
  CircleCheck,
  Clock,
  FilePlus,
  Hand,
  Inbox,
  RotateCcw,
  Send,
  TrendingUp,
  XCircle,
  Zap,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Avatar, Card, Hero, IconBadge, StatTile } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useActivity, useTeam, type ActivityEntry } from '@/lib/api';
import { formatNumber, HOURLY_COST_SAR, MIN_PER_FOLLOWUP, MIN_PER_UPDATE } from '@/features/home/value';
import { NS } from '@/features/autopilot/strings';

type Filter = 'all' | 'followups' | 'updates' | 'escalations';

const FILTER_ACTIONS: Record<Exclude<Filter, 'all'>, string[]> = {
  followups: ['followup_sent'],
  updates: ['update_received', 'submission_received'],
  escalations: ['escalated', 'sent_back'],
};

const ACTION_STYLE: Record<string, { Icon: ComponentType<LucideProps>; bg: ColorToken; fg: ColorToken }> = {
  followup_sent: { Icon: Send, bg: 'primaryTint', fg: 'primary' },
  update_received: { Icon: ArrowUpRight, bg: 'purpleTint', fg: 'purple' },
  submission_received: { Icon: Inbox, bg: 'purpleTint', fg: 'purple' },
  escalated: { Icon: AlertTriangle, bg: 'amberTint', fg: 'amberText' },
  sent_back: { Icon: RotateCcw, bg: 'amberTint', fg: 'amberText' },
  meeting_set: { Icon: CalendarCheck, bg: 'greenTint', fg: 'green' },
  task_closed: { Icon: CircleCheck, bg: 'greenTint', fg: 'green' },
  task_created: { Icon: FilePlus, bg: 'primaryTint', fg: 'primary' },
  decision_approved: { Icon: CircleCheck, bg: 'greenTint', fg: 'green' },
  decision_declined: { Icon: XCircle, bg: 'redTint', fg: 'red' },
};

function minutesFor(a: ActivityEntry) {
  if (a.action === 'followup_sent') return MIN_PER_FOLLOWUP;
  if (a.action === 'update_received' || a.action === 'submission_received') return MIN_PER_UPDATE;
  return 0;
}

function dayBucket(iso: string): 'today' | 'yesterday' | 'earlier' {
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (d >= start) return 'today';
  start.setDate(start.getDate() - 1);
  return d >= start ? 'yesterday' : 'earlier';
}

export default function AutopilotScreen() {
  const { t } = useScreenT(NS);
  const { i18n } = useTranslation();
  const { lang } = useDirection();
  const activity = useActivity(200);
  const team = useTeam();
  const [filter, setFilter] = useState<Filter>('all');

  const entries = activity.data ?? [];
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    let today = 0;
    let month = 0;
    let prev = 0;
    for (const a of entries) {
      const m = minutesFor(a);
      const d = new Date(a.created_at);
      if (dayBucket(a.created_at) === 'today') today += m;
      if (d >= monthStart) month += m;
      else if (d >= prevStart) prev += m;
    }
    return { today, month, delta: prev > 0 ? Math.round(((month - prev) / prev) * 100) : null };
  }, [entries]);

  const shown = entries.filter((a) => filter === 'all' || FILTER_ACTIONS[filter].includes(a.action));
  const groups = (['today', 'yesterday', 'earlier'] as const)
    .map((b) => ({ bucket: b, items: shown.filter((a) => dayBucket(a.created_at) === b) }))
    .filter((g) => g.items.length > 0);

  const timeFmt = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const nameOf = (id: string | null) => {
    const p = team.data?.find((x) => x.id === id);
    return p ? (lang === 'ar' && p.full_name_ar ? p.full_name_ar : p.full_name) : null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={activity.isRefetching} onRefresh={() => activity.refetch()} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <Hero overlap={30}>
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText variant="titleLg" color="onDark" style={{ fontSize: 28 }}>
                {t('title')}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.mint }} />
                <AppText variant="caption" weight="bold" color="onDark">
                  {t('live')}
                </AppText>
              </View>
            </View>
            <AppText color="onDarkMuted">{t('subtitle')}</AppText>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile variant="glass" iconBg="primaryLight" icon={<Clock color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={formatNumber(stats.today, lang)} label={t('savedToday')} />
            <StatTile variant="glass" iconBg="green" icon={<Banknote color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={`~${formatNumber(Math.round((stats.today / 60) * HOURLY_COST_SAR), lang)}`} label={t('sarSaved')} />
            <StatTile variant="glass" iconBg="orange" icon={<Hand color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={formatNumber(0, lang)} label={t('chases')} />
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -30, gap: spacing.xl }}>
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4, padding: 4, backgroundColor: colors.surface, borderRadius: radius.pill, boxShadow: shadows.raised }}>
            {(['all', 'followups', 'updates', 'escalations'] as Filter[]).map((f) => {
              const on = filter === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={{ flex: 1, minHeight: sizes.touch - 8, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : colors.transparent, paddingHorizontal: 4 }}
                >
                  <AppText variant="small" weight={on ? 'bold' : 'semibold'} color={on ? 'onDark' : 'textMuted'} numberOfLines={1}>
                    {t(f)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <Card padding={spacing.xl} style={{ gap: 0 }}>
            {groups.length === 0 && !activity.isLoading && <AppText color="textMuted">{t('empty')}</AppText>}
            {groups.map((g, gi) => (
              <View key={g.bucket}>
                <AppText
                  variant="caption"
                  weight="bold"
                  color="textFaint"
                  style={{ marginBottom: spacing.md, ...(gi > 0 ? { marginTop: 6, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border } : {}) }}
                >
                  {t(g.bucket)}
                </AppText>
                {g.items.map((a, i) => {
                  const st = ACTION_STYLE[a.action] ?? { Icon: Zap, bg: 'orangeTint' as ColorToken, fg: 'orange' as ColorToken };
                  const last = i === g.items.length - 1;
                  const who = nameOf(a.subject_id);
                  return (
                    <View key={a.id} style={{ flexDirection: 'row', gap: spacing.lg }}>
                      <View style={{ alignItems: 'center', width: 38 }}>
                        <IconBadge size={38} bg={st.bg}>
                          <st.Icon color={colors[st.fg]} size={18} strokeWidth={1.9} />
                        </IconBadge>
                        {!last && <View style={{ width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 4 }} />}
                      </View>
                      <View style={{ flex: 1, minWidth: 0, paddingBottom: last ? spacing.sm : spacing.xxl, gap: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                          <AppText weight="bold" style={{ flex: 1, lineHeight: 18 }}>
                            {i18n.language === 'ar' && a.summary_ar ? a.summary_ar : a.summary}
                          </AppText>
                          <AppText variant="caption" color="textFaint">
                            {timeFmt(a.created_at)}
                          </AppText>
                        </View>
                        {a.reason && (
                          <AppText variant="caption" color="textMuted" numberOfLines={2}>
                            {a.reason}
                          </AppText>
                        )}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {who && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bg, borderRadius: radius.pill, paddingVertical: 3, paddingStart: 3, paddingEnd: spacing.md }}>
                              <Avatar name={who} size={18} />
                              <AppText variant="caption" weight="semibold" color="textSoft" numberOfLines={1}>
                                {who}
                              </AppText>
                            </View>
                          )}
                          {a.undoable && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.orangeTint, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: spacing.md }}>
                              <Zap color={colors.orangeText} size={12} strokeWidth={2.4} />
                              <AppText variant="caption" weight="bold" color="orangeText">
                                {t('auto')}
                              </AppText>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </Card>

          <View style={{ borderRadius: radius.button, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderBlue }}>
            <View style={{ backgroundColor: colors.primaryTint, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.md, paddingEnd: spacing.xl }}>
              <IconBadge size={38} gradient="avatarBlue">
                <TrendingUp color={colors.onDark} size={18} strokeWidth={1.9} />
              </IconBadge>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color="textMuted">
                  {t('thisMonth')}
                </AppText>
                <AppText variant="cardTitle" weight="extrabold" color="navy">
                  {t('monthValue', {
                    h: formatNumber(stats.month / 60, lang, 1),
                    sar: formatNumber(Math.round((stats.month / 60) * HOURLY_COST_SAR), lang),
                  })}
                </AppText>
              </View>
              {stats.delta !== null && (
                <View style={{ backgroundColor: stats.delta >= 0 ? colors.greenTint : colors.redTint, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
                  <AppText variant="caption" weight="bold" color={stats.delta >= 0 ? 'green' : 'red'}>
                    {stats.delta >= 0 ? '▲' : '▼'} {formatNumber(Math.abs(stats.delta), lang)}%
                  </AppText>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
