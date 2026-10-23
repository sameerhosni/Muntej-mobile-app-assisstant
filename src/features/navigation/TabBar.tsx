import type { ComponentProps, ComponentType } from 'react';
import { Pressable, View } from 'react-native';
import { router, type Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { TourTarget } from '@/features/walkthrough/TourTarget';
import { Award, CircleCheck, Gift, House, ListChecks, Mic, ChartNoAxesColumn, type LucideProps } from 'lucide-react-native';
import { AppText, Gradient } from '@/components/ui';
import { colors, radius, shadows, sizes } from '@/theme/tokens';
import type { Role } from '@/features/screens/registry';
import { SHOW_REWARDS } from '@/features/rewards/visibility';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

type TabDef = { name: string; label: string; Icon: ComponentType<LucideProps> };

const MANAGER: (TabDef | 'mic')[] = [
  { name: '01-home', label: 'tabs.home', Icon: House },
  { name: '38-tasks', label: 'tabs.tasks', Icon: ListChecks },
  'mic',
  { name: '04-decisions', label: 'tabs.decisions', Icon: CircleCheck },
  { name: '05-brief', label: 'tabs.brief', Icon: ChartNoAxesColumn },
];

// everyone can create tasks (an employee may manage others), so both bars carry the centre mic
// Rewards + Badges are hidden for now (SHOW_REWARDS): Home · mic · Tasks keeps the mic centred.
const EMPLOYEE: (TabDef | 'mic')[] = SHOW_REWARDS
  ? [
      { name: '25-employee-home', label: 'tabs.home', Icon: House },
      { name: '38-tasks', label: 'tabs.tasks', Icon: ListChecks },
      'mic',
      { name: '26-rewards', label: 'tabs.rewards', Icon: Gift },
      { name: '29-badges', label: 'tabs.badges', Icon: Award },
    ]
  : [{ name: '25-employee-home', label: 'tabs.home', Icon: House }, 'mic', { name: '38-tasks', label: 'tabs.tasks', Icon: ListChecks }];

type Props = TabBarProps & { role: Role; badges?: Record<string, number> };

/** v2 bottom bar: white, rounded top, raised centre mic for everyone; employee bar is purple. */
export function TabBar({ state, navigation, role, badges = {} }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const active = state.routes[state.index]?.name;
  const accent = role === 'employee' ? colors.purple : colors.primary;
  const tint = role === 'employee' ? colors.purpleTint : colors.primaryTint;
  const items = role === 'employee' ? EMPLOYEE : MANAGER;

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.hero - 4,
        borderTopRightRadius: radius.hero - 4,
        boxShadow: shadows.nav,
        paddingTop: 10,
        paddingBottom: Math.max(insets.bottom, 10),
        minHeight: sizes.tabBarHeight - 10 + Math.max(insets.bottom, 10),
      }}
    >
      {items.map((item) => {
        if (item === 'mic') {
          return (
            <View key="mic" style={{ flex: 1, alignItems: 'center' }}>
              {/* Saree3's walkthrough lights this up: "say it here, once" */}
              {/* the lift (-34) is on the wrapper, so the highlight frames the raised mic itself */}
              <TourTarget id="mic" style={{ marginTop: -34 }}>
                <Pressable
                  onPress={() => router.push({ pathname: '/02-capture', params: { mode: 'voice' } })}
                  accessibilityRole="button"
                  accessibilityLabel={t('tabs.sayTask')}
                  style={({ pressed }) => ({
                    width: sizes.micButton,
                    height: sizes.micButton,
                    borderRadius: sizes.micButton / 2,
                    borderWidth: 4,
                    borderColor: colors.bg,
                    boxShadow: shadows.mic,
                    overflow: 'hidden',
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                  })}
                >
                  <Gradient
                    name={role === 'employee' ? 'heroEmployee' : 'heroManager'}
                    style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Mic color={colors.onDark} size={26} strokeWidth={2} />
                  </Gradient>
                </Pressable>
              </TourTarget>
            </View>
          );
        }
        const focused = active === item.name;
        const count = badges[item.name] ?? 0;
        const color = focused ? accent : colors.textFaint;
        return (
          <Pressable
            key={item.name}
            onPress={() => {
              const route = state.routes.find((r) => r.name === item.name);
              const event = navigation.emit({ type: 'tabPress', target: route?.key ?? item.name, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(item.name);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t(item.label)}
            style={{ flex: 1, alignItems: 'center', gap: 3, minHeight: sizes.touch }}
          >
            <View
              style={{ position: 'absolute', top: -8, width: 4, height: 4, borderRadius: 2, backgroundColor: focused ? accent : colors.transparent }}
            />
            <View>
              <item.Icon color={color} size={22} strokeWidth={1.9} fill={focused ? tint : 'none'} />
              {count > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    end: -10,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    paddingHorizontal: 3,
                    backgroundColor: colors.amber,
                    borderWidth: 2,
                    borderColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AppText weight="extrabold" color="onDark" style={{ fontSize: 9, lineHeight: 11 }}>
                    {count}
                  </AppText>
                </View>
              )}
            </View>
            <AppText variant="micro" weight={focused ? 'bold' : 'semibold'} style={{ color }}>
              {t(item.label)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
