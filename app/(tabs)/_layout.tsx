import { Tabs } from 'expo-router';
import { colors } from '@/theme/tokens';
import { useMyProfile, usePendingDecisionCount } from '@/lib/api';
import { TabBar } from '@/features/navigation/TabBar';

// All role tabs live in one navigator; TabBar shows only the signed-in role's tabs.
export default function TabsLayout() {
  const { data: me } = useMyProfile();
  const pending = usePendingDecisionCount();
  const role = me?.role === 'employee' ? 'employee' : 'manager';

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => <TabBar {...props} role={role} badges={{ '04-decisions': pending }} />}
    >
      <Tabs.Screen name="01-home" />
      <Tabs.Screen name="03-autopilot" />
      <Tabs.Screen name="04-decisions" />
      <Tabs.Screen name="05-brief" />
      <Tabs.Screen name="25-employee-home" />
      <Tabs.Screen name="06-employee-chat" />
      <Tabs.Screen name="26-rewards" />
      <Tabs.Screen name="29-badges" />
    </Tabs>
  );
}
