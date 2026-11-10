// Screen 01 · Super admin Home: the system dashboard — no v2 mockup; owner picked the band + 3 tabs (option 2) with
// option 1's numbers (10 Nov mockup). The super admin has no tasks and gets no notifications: he watches the system
// here (owner: "number of active accounts and number of users under each account or overall and number of tasks …
// statistics to help our team to monitor system performance"). Data: rpc system_overview (super admin only).
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { BellOff, ChevronLeft, ChevronRight, ClipboardList, ListTodo, Network, ShieldCheck, Sprout } from 'lucide-react-native';
import { AppText, Card, IconBadge, LoadingCard } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { intlTag } from '@/lib/i18n/locale';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';

const en = {
  title: 'System dashboard',
  updated: 'Updated {{time}}',
  noAlerts: 'No notifications',
  tabOverview: 'Overview',
  tabCompanies: 'Companies',
  tabHealth: 'Health',
  companies: 'Companies',
  active: 'Active users',
  invited: 'Invited',
  tasksWeek: 'Tasks this week',
  open: 'Open',
  late: 'Late',
  vsLast: '{{pct}} vs last week',
  perDay: '📈 New tasks each day',
  today: 'Today',
  busiest: '🏆 Busiest company',
  busiestVal: '{{name}} · {{n}} tasks',
  idle: '😴 No activity in 7 days',
  fresh: '🆕 New this week',
  health: '🩺 System health',
  healthy: 'Healthy',
  issues: '{{n}} to check',
  colCompany: 'Company',
  colActive: 'Active',
  colInvited: 'Invited',
  col7d: '7 days',
  colLate: 'Late',
  last24: 'Last 24 hours',
  hAlerts: '🔔 Alerts delivered',
  hPush: '📲 Sent as push',
  hWa: '💬 WhatsApp sent',
  hWaFailed: '⚠️ WhatsApp failed',
  hReports: '☀️ Reports sent today',
  hJobs: '⏱️ Scheduled jobs',
  hJobsVal: '{{run}} ran · {{failed}} failed',
  tools: 'Tools',
  growth: 'Growth',
  requests: 'Requests',
  backlog: 'Backlog',
  design: 'System design',
  failed: 'Couldn’t load the numbers. Pull down to try again.',
};
const ar: typeof en & Record<string, string> = {
  title: 'لوحة النظام',
  updated: 'محدّثة {{time}}',
  noAlerts: 'بدون تنبيهات',
  tabOverview: 'نظرة عامة',
  tabCompanies: 'الشركات',
  tabHealth: 'الصحة',
  companies: 'شركات نشطة',
  active: 'مستخدم نشط',
  invited: 'مدعو',
  tasksWeek: 'مهام الأسبوع',
  open: 'مفتوحة',
  late: 'متأخرة',
  vsLast: '{{pct}} عن الأسبوع اللي قبل',
  perDay: '📈 مهام جديدة كل يوم',
  today: 'اليوم',
  busiest: '🏆 أنشط شركة',
  busiestVal: '{{name}} · {{n}} مهمة',
  idle: '😴 بدون نشاط 7 أيام',
  fresh: '🆕 جديدة هالأسبوع',
  health: '🩺 صحة النظام',
  healthy: 'سليمة',
  issues: '{{n}} تحتاج نظرة',
  colCompany: 'الشركة',
  colActive: 'نشط',
  colInvited: 'مدعو',
  col7d: '7 أيام',
  colLate: 'متأخرة',
  last24: 'آخر 24 ساعة',
  hAlerts: '🔔 تنبيهات وصلت',
  hPush: '📲 راحت إشعار',
  hWa: '💬 واتساب وصل',
  hWaFailed: '⚠️ واتساب فشل',
  hReports: '☀️ تقارير اليوم',
  hJobs: '⏱️ المهام المجدولة',
  hJobsVal: '{{run}} اشتغلت · {{failed}} فشلت',
  tools: 'أدوات',
  growth: 'النمو',
  requests: 'الطلبات',
  backlog: 'الأعمال الباقية',
  design: 'تصميم النظام',
  failed: 'ما قدرت أجيب الأرقام. اسحب لتحت وجرّب مرة ثانية.',
};
const NS = registerStrings('systemDashboard', { en, ar });

type Company = { id: string; name: string; active: number; invited: number; tasks_7d: number; open: number; late: number; last_active: string | null };
type Overview = {
  at: string;
  totals: {
    companies: number;
    new_companies_7d: number;
    idle_companies_7d: number;
    active: number;
    invited: number;
    tasks_7d: number;
    tasks_prev_7d: number;
    open: number;
    late: number;
  };
  per_day: { day: string; n: number }[];
  companies: Company[];
  health: { alerts: number; pushed: number; wa_sent: number; wa_failed: number; reports: number; jobs_run: number; jobs_failed: number };
};
type Tab = 'overview' | 'companies' | 'health';
type Tone = 'purpleTint' | 'primaryTint' | 'amberTint' | 'greenTint' | 'redTint';

export function SystemDashboard() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('overview');
  const [pulled, setPulled] = useState(false);
  const q = useQuery({
    queryKey: ['systemOverview'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<Overview> => {
      const call = supabase.rpc.bind(supabase) as unknown as (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;
      const { data, error } = await call('system_overview');
      if (error) throw new Error(error.message);
      return data as Overview;
    },
  });
  const d = q.data;
  const fmt = (n: number) => n.toLocaleString('en-US');
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  const issues = d ? (d.health.wa_failed > 0 ? 1 : 0) + (d.health.jobs_failed > 0 ? 1 : 0) : 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.xxl, paddingTop: insets.top + spacing.lg, paddingBottom: 40, gap: spacing.lg }}
      refreshControl={
        <RefreshControl
          refreshing={pulled}
          onRefresh={async () => {
            setPulled(true);
            await q.refetch();
            setPulled(false);
          }}
          tintColor={colors.purple}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* the band: which account this is, highlighted (owner: "to be highlighted by title") */}
      <View
        accessibilityRole="header"
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.purple, borderRadius: radius.md, padding: spacing.lg, minHeight: sizes.touch }}
      >
        <ShieldCheck color={colors.onDark} size={20} />
        <AppText weight="extrabold" color="onDark" style={{ fontSize: 17, flex: 1 }}>
          {t('title')}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <BellOff color={colors.onDarkMuted} size={14} />
          <AppText variant="caption" color="onDarkMuted">
            {d ? t('updated', { time: new Date(d.at).toLocaleTimeString(intlTag(lang, 'ar-SA-u-ca-gregory-nu-latn', 'en-GB'), { hour: 'numeric', minute: '2-digit' }) }) : t('noAlerts')}
          </AppText>
        </View>
      </View>

      {/* Overview · Companies · Health */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4 }} accessibilityRole="tablist">
        {(['overview', 'companies', 'health'] as Tab[]).map((k) => (
          <Pressable
            key={k}
            onPress={() => setTab(k)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === k }}
            style={{ flex: 1, minHeight: sizes.touch, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: tab === k ? colors.purpleTint : 'transparent' }}
          >
            <AppText weight={tab === k ? 'extrabold' : 'semibold'} color={tab === k ? 'purpleDark' : 'textMuted'}>
              {t(k === 'overview' ? 'tabOverview' : k === 'companies' ? 'tabCompanies' : 'tabHealth')}
            </AppText>
          </Pressable>
        ))}
      </View>

      {q.isLoading ? (
        <LoadingCard />
      ) : !d ? (
        <Card padding={spacing.lg}>
          <AppText color="textMuted">{t('failed')}</AppText>
        </Card>
      ) : tab === 'overview' ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(
              [
                ['companies', d.totals.companies, 'purpleTint'],
                ['active', d.totals.active, 'primaryTint'],
                ['invited', d.totals.invited, 'amberTint'],
                ['tasksWeek', d.totals.tasks_7d, 'greenTint'],
                ['open', d.totals.open, 'primaryTint'],
                ['late', d.totals.late, 'redTint'],
              ] as [keyof typeof en, number, Tone][]
            ).map(([k, n, bg]) => (
              <View key={k} style={{ width: '31.5%', flexGrow: 1, backgroundColor: colors[bg], borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center' }}>
                <AppText weight="extrabold" style={{ fontSize: 22 }}>
                  {fmt(n)}
                </AppText>
                <AppText variant="caption" color="textSoft">
                  {t(k)}
                </AppText>
              </View>
            ))}
          </View>
          {d.totals.tasks_prev_7d > 0 && (
            <AppText variant="caption" color="textMuted">
              {t('vsLast', {
                pct: `${d.totals.tasks_7d >= d.totals.tasks_prev_7d ? '+' : '−'}${Math.round((Math.abs(d.totals.tasks_7d - d.totals.tasks_prev_7d) / d.totals.tasks_prev_7d) * 100)}%`,
              })}
            </AppText>
          )}
          <Card padding={spacing.lg} style={{ gap: spacing.sm }}>
            <AppText weight="extrabold">{t('perDay')}</AppText>
            <Bars days={d.per_day} lang={lang} todayLabel={t('today')} />
          </Card>
          <Card padding={spacing.lg}>
            {d.companies[0] && <Row label={t('busiest')} value={t('busiestVal', { name: d.companies[0].name, n: fmt(d.companies[0].tasks_7d) })} first />}
            <Row label={t('idle')} value={fmt(d.totals.idle_companies_7d)} tone={d.totals.idle_companies_7d ? 'amberText' : undefined} />
            <Row label={t('fresh')} value={fmt(d.totals.new_companies_7d)} />
            <Row label={t('health')} value={issues ? t('issues', { n: issues }) : t('healthy')} tone={issues ? 'amberText' : 'greenText'} onPress={() => setTab('health')} chevron={Chevron} />
          </Card>
          <AppText weight="extrabold" style={{ marginTop: spacing.sm }}>
            {t('tools')}
          </AppText>
          <Card padding={spacing.lg}>
            {(
              [
                ['growth', '/46-growth', Sprout, 'greenTint', colors.green],
                ['requests', '/60-wishlist', ClipboardList, 'purpleTint', colors.purple],
                ['backlog', '/49-backlog', ListTodo, 'amberTint', colors.amberText],
                ['design', '/52-design', Network, 'primaryTint', colors.primary],
              ] as const
            ).map(([k, href, Icon, bg, fg], i) => (
              <Pressable
                key={k}
                onPress={() => router.push(href as Href)}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizes.touch + 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}
              >
                <IconBadge size={36} bg={bg}>
                  <Icon color={fg} size={18} />
                </IconBadge>
                <AppText weight="semibold" style={{ flex: 1 }}>
                  {t(k)}
                </AppText>
                <Chevron color={colors.textMuted} size={18} />
              </Pressable>
            ))}
          </Card>
        </>
      ) : tab === 'companies' ? (
        <Card padding={spacing.lg}>
          <View style={{ flexDirection: 'row', paddingBottom: spacing.sm }}>
            <AppText variant="caption" color="textMuted" style={{ flex: 2.2 }}>
              {t('colCompany')}
            </AppText>
            {(['colActive', 'colInvited', 'col7d', 'colLate'] as const).map((k) => (
              <AppText key={k} variant="caption" color="textMuted" style={{ flex: 1, textAlign: 'center' }}>
                {t(k)}
              </AppText>
            ))}
          </View>
          {d.companies.map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: sizes.touch, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flex: 2.2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.tasks_7d > 0 ? colors.green : colors.amber }} />
                <AppText weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                  {c.name}
                </AppText>
              </View>
              {[c.active, c.invited, c.tasks_7d, c.late].map((n, i) => (
                <AppText key={i} weight="bold" color={i === 3 && n > 0 ? 'red' : 'text'} style={{ flex: 1, textAlign: 'center' }}>
                  {fmt(n)}
                </AppText>
              ))}
            </View>
          ))}
        </Card>
      ) : (
        <Card padding={spacing.lg}>
          <AppText variant="caption" color="textMuted" style={{ paddingBottom: spacing.xs }}>
            {t('last24')}
          </AppText>
          <Row label={t('hAlerts')} value={fmt(d.health.alerts)} first />
          <Row label={t('hPush')} value={fmt(d.health.pushed)} />
          <Row label={t('hWa')} value={fmt(d.health.wa_sent)} tone="greenText" />
          <Row label={t('hWaFailed')} value={fmt(d.health.wa_failed)} tone={d.health.wa_failed ? 'red' : 'greenText'} />
          <Row label={t('hReports')} value={fmt(d.health.reports)} />
          <Row
            label={t('hJobs')}
            value={t('hJobsVal', { run: fmt(d.health.jobs_run), failed: fmt(d.health.jobs_failed) })}
            tone={d.health.jobs_failed ? 'amberText' : 'greenText'}
          />
        </Card>
      )}
    </ScrollView>
  );
}

function Row({
  label,
  value,
  tone,
  first,
  onPress,
  chevron: Chev,
}: {
  label: string;
  value: string;
  tone?: 'amberText' | 'greenText' | 'red';
  first?: boolean;
  onPress?: () => void;
  chevron?: typeof ChevronLeft;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.touch, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}
    >
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <AppText weight="bold" color={tone ?? 'text'}>
        {value}
      </AppText>
      {Chev && <Chev color={colors.textMuted} size={16} />}
    </Pressable>
  );
}

/** new tasks per day, last 7 days: a bar each, the day under it */
function Bars({ days, lang, todayLabel }: { days: { day: string; n: number }[]; lang: string; todayLabel: string }) {
  const max = Math.max(1, ...days.map((x) => x.n));
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 80 }}>
        {days.map((x) => (
          <View key={x.day} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <AppText variant="caption" color="textMuted" style={{ fontSize: 10 }}>
              {x.n}
            </AppText>
            <View style={{ width: '100%', height: `${Math.max(4, (x.n / max) * 80)}%`, backgroundColor: colors.purple, borderTopLeftRadius: 5, borderTopRightRadius: 5 }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {days.map((x, i) => (
          <AppText key={x.day} variant="caption" color="textMuted" style={{ flex: 1, textAlign: 'center', fontSize: 10 }}>
            {i === days.length - 1 ? todayLabel : new Date(`${x.day}T12:00:00Z`).toLocaleDateString(intlTag(lang, 'ar-SA-u-ca-gregory-nu-latn', 'en-GB'), { weekday: 'short' })}
          </AppText>
        ))}
      </View>
    </View>
  );
}
