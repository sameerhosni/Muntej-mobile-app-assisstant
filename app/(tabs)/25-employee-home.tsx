// Screen 25 · Employee Home — see design/v2/html/EmployeeHome.dc.html (Arabic: EmployeeHomeAR.dc.html)
// Simplified (pilot feedback "too crowded"): three blocks only —
//   1. slim header: greeting, one compact progress pill (level · streak · points → Rewards), bell, avatar,
//      and Saree3's one-line status in his colour
//   2. Today's tasks: the real ones (max 3), one tap marks them done / sends them for review
//   3. shortcuts: Your week (value receipt), Rewards, Team quest, Objectives
// Rewards entry points (progress pill, Rewards shortcut) are hidden for now — see SHOW_REWARDS.
// Demo: level, streak and points come from the shared demo wallet — no gamification backend yet.
import { TourTarget } from '@/features/walkthrough/TourTarget';
import { useWalkthrough } from '@/features/walkthrough/useWalkthrough';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Gift, Hourglass, Inbox, LayoutGrid, Receipt, Trophy } from 'lucide-react-native';
import { AppText, Avatar, BrandChip, Hero, PointsCoin } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { person, personLabel } from '@/features/demo/team';
import { LEVEL, useWallet } from '@/features/rewards/wallet';
import { SHOW_REWARDS } from '@/features/rewards/visibility';
import { STREAK_DAYS } from '@/features/employee-home/demo';
import { TodayTasks } from '@/features/employee-home/TodayTasks';
import { AlertsBell } from '@/features/alerts/AlertsBell';
import { SareeLine, Shortcuts, type Shortcut } from '@/features/home/SimpleHome';
import { NS as HOME_NS } from '@/features/home/strings';
import { NS } from '@/features/employee-home/strings';
import { NS as INCOMING_NS } from '@/features/incoming/strings';
import { MORE_NS } from '@/features/more/strings';
import { MySteps } from '@/features/steps/MySteps';
import { GettingStarted } from '@/features/onboarding/GettingStarted';

const HOME_STEPS = [
  { target: 'mic', key: 'homeMic', demo: 'say' as const },
  { target: 'home.needs', key: 'homeNeeds' },
];

export default function EmployeeHome() {
  const { t } = useScreenT(NS);
  useWalkthrough('home', HOME_STEPS);
  const { t: th } = useScreenT(HOME_NS);
  const { t: ti } = useScreenT(INCOMING_NS);
  const { t: tm } = useScreenT(MORE_NS);
  const { lang } = useDirection();
  const me = useMyProfile();
  const qc = useQueryClient();
  const w = useWallet();

  const n = (v: number) => formatNumber(v, lang);
  const fullName = me.data ? (lang === 'ar' && me.data.full_name_ar ? me.data.full_name_ar : me.data.full_name) : personLabel(person('faisal'), lang);
  const firstName = fullName.split(' ')[0];

  const shortcuts: Shortcut[] = [
    { key: 'week', label: th('sc_week'), Icon: Receipt, href: '/32-receipt', bg: 'greenTint', fg: colors.green },
    { key: 'rewards', label: th('sc_rewards'), Icon: Gift, href: '/26-rewards', bg: 'orangeTint', fg: colors.orange },
    { key: 'quest', label: th('sc_quest'), Icon: Trophy, href: '/30-team-quests', bg: 'primaryTint', fg: colors.primary },
    // waiting on someone? Muntej reminds them for you (screen 09)
    { key: 'waiting', label: tm('waiting'), Icon: Hourglass, href: '/09-reverse-followup', bg: 'purpleTint', fg: colors.purple },
    { key: 'incoming', label: ti('shortcut'), Icon: Inbox, href: '/42-incoming', bg: 'primaryTint', fg: colors.primary, feature: 'incoming' },
    // Objectives, Record a meeting, Too busy?… live in "Everything Muntej does"
    { key: 'more', label: tm('shortcut'), Icon: LayoutGrid, href: '/44-more', bg: 'chip', fg: colors.textSoft },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => qc.invalidateQueries()} tintColor={colors.purple} />}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. slim header + Saree3's status line */}
        <Hero variant="employee">
          <View style={{ gap: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 }}>
                <BrandChip size={40} />
                <View style={{ gap: 2, flexShrink: 1 }}>
                  <AppText color="onDarkMuted">{t('morning')}</AppText>
                  <AppText variant="titleLg" color="onDark" numberOfLines={1}>
                    {firstName}
                  </AppText>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                {/* level · streak · points in one pill → Rewards */}
                {SHOW_REWARDS && (
                  <Pressable
                    onPress={() => router.navigate('/26-rewards')}
                    accessibilityRole="link"
                    accessibilityLabel={th('progressA11y', { level: n(LEVEL), streak: n(STREAK_DAYS), pts: n(w.balance) })}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      minHeight: sizes.touch - 8,
                      paddingStart: 5,
                      paddingEnd: spacing.md,
                      borderRadius: radius.pill,
                      backgroundColor: colors.surface,
                      opacity: pressed ? 0.88 : 1,
                    })}
                  >
                    <PointsCoin size={22} />
                    <AppText variant="caption" weight="extrabold" color="orangeText" style={{ writingDirection: 'ltr' }}>
                      {`Lv ${n(LEVEL)} · 🔥${n(STREAK_DAYS)} · ${n(w.balance)}`}
                    </AppText>
                  </Pressable>
                )}
                <AlertsBell />
                <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={t('settings')} hitSlop={2}>
                  <Avatar name={fullName || '?'} size={40} gradient="avatarBlue" ring />
                </Pressable>
              </View>
            </View>
            <SareeLine />
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, gap: spacing.xxl + 4, marginTop: spacing.lg }}>
          {/* invited: Saree3's short tour until it's done */}
          <GettingStarted />
          {/* 2. today's real tasks (max 3) */}
          <TourTarget id="home.needs">
            <TodayTasks />
          </TourTarget>
          <MySteps />

          {/* 3. everything else, one tap away */}
          <Shortcuts items={SHOW_REWARDS ? shortcuts : shortcuts.filter((s) => s.key !== 'rewards')} />
        </View>
      </ScrollView>
    </View>
  );
}
