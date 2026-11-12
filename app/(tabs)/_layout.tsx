import { Tabs } from 'expo-router';
import { colors } from '@/theme/tokens';
import { useMyProfile, usePendingDecisionCount } from '@/lib/api';
import { TabBar } from '@/features/navigation/TabBar';
import { useNeedsYou } from '@/features/tasks/NeedsYou';
import { SCREENS } from '@/features/screens/registry';
import { LadderCelebrations } from '@/features/ladder/Journey';

// All role tabs live in one navigator; TabBar shows only the signed-in role's tabs.
export default function TabsLayout() {
  const { data: me } = useMyProfile();
  const decisionsOnly = usePendingDecisionCount();
  // one «يحتاجك» (owner, 11 Nov): the badge counts everything waiting on you, the same as the screen, Home and WhatsApp
  const needs = useNeedsYou();
  // (no number until the shared list is in: never a partial count)
  const pending = needs.oneOn ? (needs.counting ? 0 : needs.count) : decisionsOnly;
  const role = me?.role === 'employee' ? 'employee' : 'manager';

  return (
    <>
    {/* value ladder: a toast (and once, the M3 card) when a new moment is reached */}
    {me && <LadderCelebrations />}
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => {
        // show the bar that belongs to the screen on display (lets the prototype walk both roles)
        const current = props.state.routes[props.state.index]?.name ?? '';
        const tab = SCREENS.find((s) => s.route === `/${current}`)?.tab;
        // shared tabs (e.g. 38 Tasks) keep the signed-in user's bar
        const screenRole = tab && tab !== 'both' ? tab : role;
        return (
          <TabBar
            {...props}
            role={screenRole}
            // employees have no «يحتاجك» tab: their count sits on Tasks, where their «يحتاجك» list is
            badges={screenRole === 'employee' && needs.oneOn ? { '38-tasks': pending } : { '04-decisions': pending }}
            labels={needs.oneOn ? { '04-decisions': 'tabs.needsYou' } : {}}
          />
        );
      }}
    >
      <Tabs.Screen name="01-home" />
      <Tabs.Screen name="03-autopilot" />
      <Tabs.Screen name="04-decisions" />
      <Tabs.Screen name="05-brief" />
      <Tabs.Screen name="38-tasks" />
      <Tabs.Screen name="25-employee-home" />
      <Tabs.Screen name="06-employee-chat" />
      <Tabs.Screen name="26-rewards" />
      <Tabs.Screen name="29-badges" />
    </Tabs>
    </>
  );
}
