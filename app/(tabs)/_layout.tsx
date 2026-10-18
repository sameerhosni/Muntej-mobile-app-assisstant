import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChartNoAxesColumn, CircleCheck, House, RotateCw } from 'lucide-react-native';
import { colors, fontFamily, sizes } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { usePendingDecisionCount } from '@/lib/api';

export default function TabsLayout() {
  const { t } = useTranslation();
  const PENDING_DECISIONS = usePendingDecisionCount();
  const { lang } = useDirection();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.navBg,
          borderTopColor: colors.navBorder,
          borderTopWidth: 1,
          height: sizes.tabBarHeight + Math.max(insets.bottom - 8, 0),
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: fontFamily[lang].medium, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="01-home"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => <House color={color} size={22} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="03-autopilot"
        options={{
          title: t('tabs.autopilot'),
          tabBarIcon: ({ color }) => <RotateCw color={color} size={22} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="04-decisions"
        options={{
          title: t('tabs.decisions'),
          tabBarIcon: ({ color }) => <CircleCheck color={color} size={22} strokeWidth={1.8} />,
          tabBarBadge: PENDING_DECISIONS > 0 ? PENDING_DECISIONS : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.amber,
            color: colors.amberDeep,
            fontFamily: fontFamily.mono.semibold,
            fontSize: 10,
          },
        }}
      />
      <Tabs.Screen
        name="05-brief"
        options={{
          title: t('tabs.brief'),
          tabBarIcon: ({ color }) => <ChartNoAxesColumn color={color} size={22} strokeWidth={1.8} />,
        }}
      />
    </Tabs>
  );
}
