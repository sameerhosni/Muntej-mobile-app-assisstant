// Screen 01 · Manager Home — see design/v2/html/Main.dc.html (Arabic: MainAR.dc.html)
// "Today", five cards (owner: organised as cards, the dashboard numbers on Home, nothing twice):
//   header: greeting + bell + avatar, and Saree3's one-line status in his colour
//   1. today at a glance: open · late · urgent · waiting for you (each opens its tasks), Saree3's line on what
//      matters most, the busiest teams, and the full dashboard (screen 56)
//   2. needs you, one card: decisions (Approve), work to approve, tasks from your tools, tasks given to you, answers
//   3. Saree3, one card: what he's working on, what he did since your last visit, risks, what's new
//   4. this week's wins · then your shortcuts open from a side tab or from Saree3 (owner, 20 Nov; no row on Home)
// The mic in the tab bar captures tasks; the Tasks tab lists them; value numbers live in "Your week".
import { TourTarget } from '@/features/walkthrough/TourTarget';
import { FromSaree3, TeamWins } from '@/features/home/TeamRadar';
import { useWalkthrough } from '@/features/walkthrough/useWalkthrough';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { AppText, Avatar, BrandChip, Hero } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useMyProfile } from '@/lib/api';
import { AlertsBell } from '@/features/alerts/AlertsBell';
import { useProto } from '@/features/prototype/store';
import { NeedsYou, SareeLine } from '@/features/home/SimpleHome';
import { QuickPanel } from '@/features/launcher/QuickPanel';
import { GlanceCard } from '@/features/home/GlanceCard';
import { JourneyCard } from '@/features/ladder/Journey';
import { useTasks } from '@/lib/api';
import { ConfirmNew } from '@/features/home/ConfirmNew';
import { WhatsNewStrip } from '@/features/launch/WhatsNew';
import { BiometricOffer } from '@/features/auth/BiometricOffer';
import { JobsStrip } from '@/features/saree3/JobsStrip';
import { MyRequests } from '@/features/home/MyRequests';
import { Spotlight } from '@/features/launch/Spotlight';
import { GettingStarted } from '@/features/onboarding/GettingStarted';
import { useHomeSection } from '@/features/prefs/appPrefs';
import { HomeSectionsRow } from '@/features/prefs/HomeSectionsRow';
import { FeatureCards } from '@/features/prefs/featureCards';
import { SystemDashboard } from '@/features/system/SystemDashboard';
function greetingKey(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'home.morning' : h < 18 ? 'home.afternoon' : 'home.evening';
}

const HOME_STEPS = [
  { target: 'mic', key: 'homeMic', demo: 'say' as const },
  { target: 'home.needs', key: 'homeNeeds' },
  // the shortcut row left Home for your shortcuts (side panel or Saree3, owner 20 Nov): the tab is lit instead
  { target: 'home.panel', key: 'homePanel' },
];

export default function ManagerHome() {
  const { t } = useTranslation();
  // first visit: Saree3 lights up the mic (with a live demo), what needs you, and the shortcuts
  useWalkthrough('home', HOME_STEPS);
  // the sections the person chose to see (Customize Home)
  const show = useHomeSection();
  const { lang } = useDirection();
  const me = useMyProfile();
  const { active: protoActive } = useProto();
  const qc = useQueryClient();
  const tasks = useTasks();
  // tasks someone gave me, waiting for my "got it" (they sit inside Needs you)
  const confirmCount = (tasks.data ?? []).filter((x) => x.owner_id === me.data?.id && x.status === 'assigned' && !!x.assigner_id && x.assigner_id !== me.data?.id).length;

  if (me.data?.role === 'employee' && !protoActive) return <Redirect href="/25-employee-home" />;
  // the super admin's own seat has no tasks: its Home is the system dashboard (owner, 10 Nov)
  if (me.data?.role === 'super_admin') return <SystemDashboard />;

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
          {/* 1. today at a glance: the 4 numbers, Saree3's line on what matters most, the busiest teams */}
          {show('glance') && (
            <Spotlight id="home.pulse">
              <GlanceCard />
            </Spotlight>
          )}

          {/* the value ladder: the next moment on the way to "create it and forget it" (gone once the team runs on it) */}
          {show('journey') && (
            <TourTarget id="home.journey">
              <JourneyCard />
            </TourTarget>
          )}

          {/* 2. everything that needs you, in one card: decisions, work to approve, tasks from your tools, tasks
                 given to you waiting for your "got it", answers to what you asked */}
          {show('needs') && (
          <TourTarget id="home.needs">
            <NeedsYou hasMore={confirmCount > 0}>
              <TourTarget id="home.confirm">
                <ConfirmNew bare />
              </TourTarget>
              <MyRequests bare />
            </NeedsYou>
          </TourTarget>
          )}

          {/* 3. Saree3, one card: what he's working on, what he did since your last visit, and what's new in Muntej.
                 No «اللي عيني عليه عنك» list here (owner, 19 Nov: "not urgent for me to see what Saree3 is doing"):
                 late and blocked tasks live in Tasks, and what needs you in «يحتاجك» */}
          {(show('saree3') || show('whatsnew')) && (
          <TourTarget id="home.from">
            <FromSaree3
              top={
                <TourTarget id="home.jobs">
                  <JobsStrip />
                </TourTarget>
              }
            >
              {show('whatsnew') && <WhatsNewStrip />}
              <BiometricOffer />
            </FromSaree3>
          </TourTarget>
          )}

          {/* 4. this week's achievements */}
          {show('wins') && <TeamWins />}

          {/* the features the person added to Home (Customize Home) */}
          <FeatureCards on={show} />

          {/* everything else: your shortcuts, from the side panel or Saree3 (owner, 20 Nov: "many icons in home page …
              like android user experience … open only selected one"); the old shortcut row is gone */}

          {/* choose which sections show here */}
          <HomeSectionsRow />
        </View>
      </ScrollView>
      <QuickPanel />
    </View>
  );
}
