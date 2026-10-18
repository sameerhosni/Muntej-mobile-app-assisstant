import type { ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme/tokens';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  /** Extra space at the bottom, e.g. when a BottomCTA overlays the content. */
  bottomInset?: number;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ children, scroll = true, bottomInset = 24, edges = ['top'], contentStyle }: Props) {
  const inner = [{ paddingHorizontal: spacing.screen, paddingTop: 20, gap: spacing.lg }, contentStyle];
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[inner, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
