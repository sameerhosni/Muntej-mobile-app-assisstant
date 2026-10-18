// Screen 25 · Employee Home — see design/v2/html/EmployeeHome.dc.html (Arabic: EmployeeHomeAR.dc.html)
// Phase A: hero, "your week" and the employee's real tasks. Level ring, streak, quests and points arrive with Phase B.
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Banknote, Calendar, Clock, Sparkles, Users } from 'lucide-react-native';
import { AppText, Avatar, Card, Chip, Hero, IconBadge, PointsCoin, SectionTitle, StatTile } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { ACTIVE_STATUSES, useHomeStats, useMyProfile, useTasks, type TaskPriority } from '@/lib/api';
import { formatNumber, hoursSaved } from '@/features/home/value';
import { formatDue } from '@/features/capture/format';
import type { ChipTone } from '@/components/ui/Chip';

const priorityTone: Record<TaskPriority, ChipTone> = { low: 'neutral', medium: 'primary', high: 'amber', urgent: 'red' };

export default function EmployeeHome() {
  const { t } = useTranslation();
  const { lang } = useDirection();
  const me = useMyProfile();
  const stats = useHomeStats();
  const tasks = useTasks({ ownerId: me.data?.id, statuses: ACTIVE_STATUSES });

  const firstName = (lang === 'ar' && me.data?.full_name_ar ? me.data.full_name_ar : me.data?.full_name ?? '').split(' ')[0];
  // employee view of "time saved": updates they gave in one tap instead of writing reports
  const hours = stats.data ? hoursSaved(0, stats.data.updatesReceived) : null;
  const myTasks = (tasks.data ?? []).filter((x) => x.owner_id === me.data?.id);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={tasks.isRefetching}
            onRefresh={() => {
              tasks.refetch();
              stats.refetch();
            }}
            tintColor={colors.purple}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Hero variant="employee" overlap={34}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ gap: 2, flexShrink: 1 }}>
              <AppText color="onDarkMuted">{t('home.morningEmployee')}</AppText>
              <AppText variant="titleLg" color="onDark" numberOfLines={1}>
                {firstName || ' '}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Pressable
                onPress={() => router.push('/26-rewards')}
                accessibilityRole="button"
                accessibilityLabel={t('tabs.rewards')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  height: 36,
                  paddingStart: 5,
                  paddingEnd: spacing.lg,
                  borderRadius: radius.pill,
                  backgroundColor: colors.surface,
                }}
              >
                <PointsCoin size={26} />
                <AppText weight="extrabold" color="orangeText">
                  –
                </AppText>
              </Pressable>
              <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={t('settings.open')}>
                <Avatar name={me.data?.full_name ?? '?'} size={42} gradient="avatarBlue" ring />
              </Pressable>
            </View>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              backgroundColor: colors.glass,
              borderWidth: 1,
              borderColor: colors.glassBorder,
              borderRadius: radius.tile,
              padding: spacing.md,
            }}
          >
            <Sparkles color={colors.goldLight} size={16} strokeWidth={2} />
            <AppText variant="caption" color="onDark" style={{ flex: 1 }}>
              {t('home.pointsSoon')}
            </AppText>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, gap: spacing.xxl + 4, marginTop: -34 }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }} accessibilityLabel={t('home.yourWeek')}>
            <StatTile iconBg="primaryTint" icon={<Clock color={colors.primary} size={14} strokeWidth={2} />}
              value={hours === null ? '–' : t('home.hoursValue', { n: formatNumber(hours, lang, 1) })} label={t('home.lessReporting')} />
            <StatTile iconBg="greenTint" icon={<Banknote color={colors.green} size={14} strokeWidth={2} />}
              value="–" label={t('home.sarInPoints')} />
            <StatTile iconBg="orangeTint" icon={<Users color={colors.orange} size={14} strokeWidth={2} />}
              value="–" label={t('home.statusMeetings')} />
          </View>

          <View style={{ gap: spacing.md }}>
            <SectionTitle title={t('home.myTasks')} />
            {myTasks.length === 0 && !tasks.isLoading && (
              <Card>
                <AppText color="textMuted">{t('home.noTasks')}</AppText>
              </Card>
            )}
            {myTasks.map((task) => (
              <Card
                key={task.id}
                padding={spacing.lg}
                onPress={() => router.push('/14-task-detail')}
                accessibilityLabel={task.title}
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 58 }}
              >
                <IconBadge size={36} bg="purpleTint">
                  <Calendar color={colors.purple} size={17} strokeWidth={1.9} />
                </IconBadge>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText weight="bold" numberOfLines={1}>
                    {task.title}
                  </AppText>
                  {task.due_at && (
                    <AppText variant="caption" color="textMuted">
                      {t('home.due', { when: formatDue(task.due_at, lang) })}
                    </AppText>
                  )}
                </View>
                <Chip label={t(`capture.p_${task.priority}`)} tone={priorityTone[task.priority]} style={{ alignSelf: 'center' }} />
              </Card>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
