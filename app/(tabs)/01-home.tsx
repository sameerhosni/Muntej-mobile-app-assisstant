// Screen 01 · Manager Home — see design/v2/html/Main.dc.html (Arabic: MainAR.dc.html)
// "Today" — what a manager checks every morning, top to bottom, each block short (max 3 rows) and hidden when empty:
//   1. slim header: greeting + bell + avatar, and Saree3's one-line status in his colour
//   2. team pulse: working on · late · done this week · yours (each number opens those tasks)
//      + "Muntej is on it": late work it is chasing, things it did by itself today (→ Autopilot log)
//   3. "Needs you": decisions only — tasks found in messages, decisions, finished work (one-tap Approve)
//   4. who needs support (late / blocked / sent back / overbooked); Muntej is already following up with them
//   5. next 3 days: the most important work coming up (team + yours); then your own tasks, tick to finish
//   6. shortcuts: Your week, Team, Tasks from email, Record a meeting, More (everything else: 44-more)
// The mic in the tab bar captures tasks; the Tasks tab lists them; value numbers live in "Your week".
import { TourTarget } from '@/features/walkthrough/TourTarget';
import { useWalkthrough } from '@/features/walkthrough/useWalkthrough';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Inbox, LayoutGrid, Mic, Receipt, Users } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AppText, Avatar, BrandChip, Hero } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { AlertsBell } from '@/features/alerts/AlertsBell';
import { useProto } from '@/features/prototype/store';
import { NeedsYou, SareeLine, Shortcuts } from '@/features/home/SimpleHome';
import { MuntejHandling, MyTasks, NeedsSupport, TeamPulse } from '@/features/home/TodayHome';
import { Spotlight } from '@/features/launch/Spotlight';
import { MySteps } from '@/features/steps/MySteps';
import { NS } from '@/features/home/strings';
import { NextDays } from '@/features/home/NextDays';
import { GettingStarted } from '@/features/onboarding/GettingStarted';
import { NS as INCOMING_NS } from '@/features/incoming/strings';
import { MORE_NS } from '@/features/more/strings';
function greetingKey(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'home.morning' : h < 18 ? 'home.afternoon' : 'home.evening';
}

const HOME_STEPS = [
  { target: 'mic', key: 'homeMic', demo: 'say' as const },
  { target: 'home.needs', key: 'homeNeeds' },
  { target: 'home.more', key: 'homeMore' },
];

export default function ManagerHome() {
  const { t } = useTranslation();
  // first visit: Saree3 lights up the mic (with a live demo), what needs you, and the shortcuts
  useWalkthrough('home', HOME_STEPS);
  const { t: th } = useScreenT(NS);
  const { t: ti } = useScreenT(INCOMING_NS);
  const { t: tm } = useScreenT(MORE_NS);
  const { lang } = useDirection();
  const me = useMyProfile();
  const { active: protoActive } = useProto();
  const qc = useQueryClient();

  if (me.data?.role === 'employee' && !protoActive) return <Redirect href="/25-employee-home" />;

  const firstName = (lang === 'ar' && me.data?.full_name_ar ? me.data.full_name_ar : (me.data?.full_name ?? '')).split(' ')[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => qc.invalidateQueries()} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. slim header + Saree3's status line */}
        <Hero>
          <View style={{ gap: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 }}>
                <BrandChip size={40} />
                <View style={{ gap: 2, flexShrink: 1 }}>
                  <AppText color="onDarkMuted">{t(greetingKey())}</AppText>
                  <AppText variant="titleLg" color="onDark" numberOfLines={1}>
                    {firstName || ' '}
                  </AppText>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <AlertsBell />
                <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={t('settings.open')}>
                  <Avatar name={me.data?.full_name ?? '?'} size={42} gradient="avatarOrange" ring />
                </Pressable>
              </View>
            </View>
            <SareeLine />
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, gap: spacing.xxl + 4, marginTop: spacing.xxl }}>
          {/* a new account: Saree3's getting-started steps until they're done */}
          <GettingStarted />

          {/* 2. the team at a glance + what Muntej is handling by itself */}
          <View style={{ gap: spacing.md }}>
            <Spotlight id="home.pulse">
              <TeamPulse />
            </Spotlight>
            <Spotlight id="home.handling">
              <MuntejHandling />
            </Spotlight>
          </View>

          {/* 3. what needs you, max 3, with one-tap actions */}
          <TourTarget id="home.needs">
            <NeedsYou />
          </TourTarget>

          {/* what is coming up in the next 3 working days, most important first */}
          <NextDays />

          {/* 4. people who need a hand, 5. your own tasks (both hidden when empty) */}
          <NeedsSupport />
          <MyTasks />
          <MySteps />

          {/* 6. everything else, one tap away */}
          <TourTarget id="home.more">
            <Shortcuts
              items={[
                { key: 'week', label: th('sc_week'), Icon: Receipt, href: '/32-receipt', bg: 'greenTint', fg: colors.green },
                { key: 'team', label: th('sc_team'), Icon: Users, href: '/39-team', bg: 'primaryTint', fg: colors.primary },
                {
                  key: 'incoming',
                  label: ti('shortcut'),
                  Icon: Inbox,
                  href: '/42-incoming',
                  bg: 'primaryTint',
                  fg: colors.primary,
                  feature: 'incoming',
                },
                // Objectives, Autopilot, Roadmap… live in "Everything Muntej does" (Autopilot is also the "Muntej is on it" card)
                { key: 'more', label: tm('shortcut'), Icon: LayoutGrid, href: '/44-more', bg: 'chip', fg: colors.textSoft },
              ]}
            />
          </TourTarget>
        </View>
      </ScrollView>
    </View>
  );
}
