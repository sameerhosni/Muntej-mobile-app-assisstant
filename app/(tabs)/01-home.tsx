// Screen 01 · Home — see design/screens/01-Home.png
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react-native';
import { AppText, Avatar, Card, SectionTitle, StatTile } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useActivity, useHomeStats, useMyProfile, usePendingDecisionCount } from '@/lib/api';
import { MicButton } from '@/features/home/MicButton';

function greetingKey(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'home.morning' : h < 18 ? 'home.afternoon' : 'home.evening';
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const { lang, isRTL } = useDirection();
  const me = useMyProfile();
  const stats = useHomeStats();
  const activity = useActivity(3);
  const pending = usePendingDecisionCount();

  const firstName = (lang === 'ar' && me.data?.full_name_ar ? me.data.full_name_ar : me.data?.full_name ?? '').split(' ')[0];
  const isManager = me.data?.role === 'manager';
  const refreshing = stats.isRefetching || activity.isRefetching;
  const onRefresh = () => {
    stats.refetch();
    activity.refetch();
    me.refetch();
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingTop: 28, paddingBottom: 32, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.teal} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ gap: 2, flexShrink: 1 }}>
            <AppText color="textMuted">{t(greetingKey())}</AppText>
            <AppText variant="title" numberOfLines={1}>
              {firstName || ' '}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.tealDeep,
                paddingHorizontal: spacing.md,
                paddingVertical: 6,
                borderRadius: radius.pill,
              }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.teal }} />
              <AppText variant="caption" color="teal">
                {t('home.muntejOn')}
              </AppText>
            </View>
            <Pressable
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel={t('settings.open')}
              hitSlop={4}
            >
              <Avatar name={me.data?.full_name ?? '?'} size={sizes.touch} />
            </Pressable>
          </View>
        </View>

        {/* Handling card */}
        <Card style={{ marginTop: 8 }}>
          <AppText color="textMuted">{t('home.handlingNow')}</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
            <AppText variant="hero" mono weight="semibold" color="teal" style={{ lineHeight: 60 }}>
              {stats.data?.handling ?? '–'}
            </AppText>
            <AppText variant="lead" weight="bold" style={{ flex: 1, paddingBottom: 6 }}>
              {t(isManager ? 'home.tasksChasing' : 'home.tasksChasingEmployee')}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile value={stats.data?.followupsSent ?? '–'} label={t('home.followupsSent')} />
            <StatTile value={stats.data?.updatesReceived ?? '–'} label={t('home.updatesReceived')} />
            <StatTile value={stats.data?.timesAsked ?? '–'} label={t('home.timesAsked')} valueColor="teal" />
          </View>
        </Card>

        {/* Decisions banner */}
        {pending > 0 && (
          <Card
            tone="amber"
            size="md"
            onPress={() => router.push('/04-decisions')}
            accessibilityLabel={t('home.decisionsTitle', { count: pending })}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.sm,
                  backgroundColor: colors.amber,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppText mono weight="semibold" color="amberDeep">
                  {pending}
                </AppText>
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="cardTitle">{t('home.decisionsTitle', { count: pending })}</AppText>
                <AppText variant="caption" color="amberSoft">
                  {t('home.decisionsSub')}
                </AppText>
              </View>
            </View>
            <ChevronRight color={colors.amber} size={20} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </Card>
        )}

        {/* Muntej is now… */}
        <SectionTitle title={t('home.nowTitle')} actionLabel={t('common.seeAll')} onAction={() => router.push('/03-autopilot')} />
        <View style={{ gap: spacing.md }}>
          {activity.data?.length === 0 && (
            <AppText color="textMuted">{t('home.nothingYet')}</AppText>
          )}
          {activity.data?.map((a, i) => {
            const fresh = i < 2;
            return (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View
                  style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fresh ? colors.teal : colors.textDim }}
                />
                <AppText color={fresh ? 'text' : 'textMuted'} style={{ flex: 1 }} numberOfLines={2}>
                  {lang === 'ar' && a.summary_ar ? a.summary_ar : a.summary}
                </AppText>
              </View>
            );
          })}
        </View>

        {/* Mic */}
        <View style={{ alignItems: 'center', gap: spacing.xl, marginTop: 28 }}>
          <MicButton label={t('home.recordLabel')} onPress={() => router.push({ pathname: '/02-capture', params: { mode: 'voice' } })} />
          <AppText variant="lead" weight="extrabold">
            {t('home.sayIt')}
          </AppText>
          <AppText variant="small" color="textMuted" align="center">
            {t('home.orType')}{' '}
            <AppText
              variant="small"
              color="teal"
              onPress={() => router.push({ pathname: '/02-capture', params: { mode: 'text' } })}
              accessibilityRole="link"
            >
              {t('home.typeIt')}
            </AppText>
            {t('home.typeTail')}
          </AppText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
