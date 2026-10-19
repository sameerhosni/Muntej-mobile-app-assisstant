import { Tabs } from 'expo-router';
import { colors } from '@/theme/tokens';
import { useMyProfile, usePendingDecisionCount } from '@/lib/api';
import { TabBar } from '@/features/navigation/TabBar';
import { SCREENS } from '@/features/screens/registry';

// All role tabs live in one navigator; TabBar shows only the signed-in role's tabs.
export default function TabsLayout() {
  const { data: me } = useMyProfile();
  const pending = usePendingDecisionCount();
  const role = me?.role === 'employee' ? 'employee' : 'manager';

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => {
        // show the bar that belongs to the screen on display (lets the prototype walk both roles)
        const current = props.state.routes[props.state.index]?.name ?? '';
        const tab = SCREENS.find((s) => s.route === `/${current}`)?.tab;
        // shared tabs (e.g. 38 Tasks) keep the signed-in user's bar
        const screenRole = tab && tab !== 'both' ? tab : role;
        return <TabBar {...props} role={screenRole} badges={{ '04-decisions': pending }} />;
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
  );
}
