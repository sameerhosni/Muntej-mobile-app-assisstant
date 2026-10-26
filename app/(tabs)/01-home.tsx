// Screen 01 · Manager Home — see design/v2/html/Main.dc.html (Arabic: MainAR.dc.html)
// "Today", five cards (owner: organised as cards, the dashboard numbers on Home, nothing twice):
//   header: greeting + bell + avatar, and Saree3's one-line status in his colour
//   1. today at a glance: open · late · urgent · waiting for you (each opens its tasks), Saree3's line on what
//      matters most, the busiest teams, and the full dashboard (screen 56)
//   2. needs you, one card: decisions (Approve), work to approve, tasks from your tools, tasks given to you, answers
//   3. Saree3, one card: what he's working on, what he did since your last visit, risks, what's new
//   4. this week's wins · 5. shortcuts: Your week, Team, Your tools, More
// The mic in the tab bar captures tasks; the Tasks tab lists them; value numbers live in "Your week".
import { TourTarget } from '@/features/walkthrough/TourTarget';
import { FromSaree3, TeamRisks, TeamWins } from '@/features/home/TeamRadar';
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
import { GlanceCard } from '@/features/home/GlanceCard';
import { JourneyCard } from '@/features/ladder/Journey';
import { useTasks } from '@/lib/api';
import { ConfirmNew } from '@/features/home/ConfirmNew';
import { WhatsNewStrip } from '@/features/launch/WhatsNew';
import { JobsStrip } from '@/features/saree3/JobsStrip';
import { MyRequests } from '@/features/home/MyRequests';
import { Spotlight } from '@/features/launch/Spotlight';
import { NS } from '@/features/home/strings';
import { GettingStarted } from '@/features/onboarding/GettingStarted';
import { NS as INCOMING_NS } from '@/features/incoming/strings';
import { MORE_NS } from '@/features/more/strings';
import { useHomeSection } from '@/features/prefs/appPrefs';
import { HomeSectionsRow } from '@/features/prefs/HomeSectionsRow';
import { FeatureCards } from '@/features/prefs/featureCards';
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

          {/* 3. Saree3, one card: what he's working on, what he did since your last visit, the risks he's watching,
                 and what's new in Muntej */}
          {(show('saree3') || show('whatsnew')) && (
          <TourTarget id="home.from">
            <FromSaree3
              top={
                <TourTarget id="home.jobs">
                  <JobsStrip />
                </TourTarget>
              }
            >
              {show('saree3') && (
                <TourTarget id="home.risks">
                  <TeamRisks embedded />
                </TourTarget>
              )}
              {show('whatsnew') && <WhatsNewStrip />}
            </FromSaree3>
          </TourTarget>
          )}

          {/* 4. this week's achievements */}
          {show('wins') && <TeamWins />}

          {/* the features the person added to Home (Customize Home) */}
          <FeatureCards on={show} />

          {/* 6. everything else, one tap away */}
          {show('shortcuts') && (
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
          )}

          {/* choose which sections show here */}
          <HomeSectionsRow />
        </View>
      </ScrollView>
    </View>
  );
}
