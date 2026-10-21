// Screen 01 · Manager Home — see design/v2/html/Main.dc.html (Arabic: MainAR.dc.html)
// "Today" — what a manager checks every morning, top to bottom, each block short (max 3 rows) and hidden when empty:
//   1. slim header: greeting + bell + avatar, and Saree3's one-line status in his colour
//   2. team pulse: working on · late · done this week · yours (each number opens those tasks)
//   3. "Needs you": decisions → reviews (one-tap Approve) → late team tasks (one-tap Nudge)
//   4. who needs support (late / blocked / sent back / overbooked) with one-tap Check in
//   5. your own tasks, tick to finish
//   6. shortcuts: Your week (value receipt), Team, Objectives, Autopilot
// The mic in the tab bar captures tasks; the Tasks tab lists them; value numbers live in "Your week".
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Receipt, RotateCw, Target, Users } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AppText, Avatar, Hero } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { AlertsBell } from '@/features/alerts/AlertsBell';
import { useProto } from '@/features/prototype/store';
import { NeedsYou, SareeLine, Shortcuts } from '@/features/home/SimpleHome';
import { MyTasks, NeedsSupport, TeamPulse } from '@/features/home/TodayHome';
import { NS } from '@/features/home/strings';

function greetingKey(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'home.morning' : h < 18 ? 'home.afternoon' : 'home.evening';
}

export default function ManagerHome() {
  const { t } = useTranslation();
  const { t: th } = useScreenT(NS);
  const { lang } = useDirection();
  const me = useMyProfile();
  const { active: protoActive } = useProto();
  const qc = useQueryClient();

  if (me.data?.role === 'employee' && !protoActive) return <Redirect href="/25-employee-home" />;

  const firstName = (lang === 'ar' && me.data?.full_name_ar ? me.data.full_name_ar : me.data?.full_name ?? '').split(' ')[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => qc.invalidateQueries()} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* 1. slim header + Saree3's status line */}
        <Hero>
          <View style={{ gap: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ gap: 2, flexShrink: 1 }}>
                <AppText color="onDarkMuted">{t(greetingKey())}</AppText>
                <AppText variant="titleLg" color="onDark" numberOfLines={1}>
                  {firstName || ' '}
                </AppText>
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
          {/* 2. the team at a glance */}
          <TeamPulse />

          {/* 3. what needs you, max 3, with one-tap actions */}
          <NeedsYou />

          {/* 4. people who need a hand, 5. your own tasks (both hidden when empty) */}
          <NeedsSupport />
          <MyTasks />

          {/* 6. everything else, one tap away */}
          <Shortcuts
            items={[
              { key: 'week', label: th('sc_week'), Icon: Receipt, href: '/32-receipt', bg: 'greenTint', fg: colors.green },
              { key: 'team', label: th('sc_team'), Icon: Users, href: '/39-team', bg: 'primaryTint', fg: colors.primary },
              { key: 'obj', label: th('sc_objectives'), Icon: Target, href: '/40-objectives', bg: 'purpleTint', fg: colors.purple },
              { key: 'auto', label: th('sc_autopilot'), Icon: RotateCw, href: '/03-autopilot', bg: 'amberTint', fg: colors.amberText },
            ]}
          />
        </View>
      </ScrollView>
    </View>
  );
}
