import { useCallback, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { G, Path } from 'react-native-svg';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { Gradient } from './Gradient';

type Props = {
  children: ReactNode;
  /** Manager screens are blue, employee screens purple. */
  variant?: 'manager' | 'employee';
  /** Extra space at the bottom for a card that overlaps the hero edge. */
  overlap?: number;
  style?: StyleProp<ViewStyle>;
};

/** Gradient header with rounded bottom corners and the mockups' zig-zag + circle decoration. */
export function Hero({ children, variant = 'manager', overlap = 0, style }: Props) {
  const insets = useSafeAreaInsets();
  const { isRTL } = useDirection();
  // white status-bar text over the gradient while this screen is focused; dark again elsewhere
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );
  return (
    <Gradient
      name={variant === 'employee' ? 'heroEmployee' : 'heroManager'}
      style={[
        {
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.screen,
          paddingBottom: spacing.xxl + 6 + overlap,
          borderBottomLeftRadius: radius.hero,
          borderBottomRightRadius: radius.hero,
          overflow: 'hidden',
          gap: spacing.lg,
        },
        style,
      ]}
    >
      <Svg
        width={150}
        height={150}
        viewBox="0 0 150 150"
        style={{ position: 'absolute', top: insets.top + 36, opacity: 0.16, ...(isRTL ? { left: -20 } : { right: -20 }) }}
        pointerEvents="none"
      >
        <G fill="none" stroke={colors.onDark} strokeWidth={2}>
          <Path d="M0 40l25-25 25 25 25-25 25 25 25-25 25 25" />
          <Path d="M0 70l25-25 25 25 25-25 25 25 25-25 25 25" />
          <Path d="M0 100l25-25 25 25 25-25 25 25 25-25 25 25" />
          <Path d="M12 128h126" strokeDasharray="6 8" />
        </G>
      </Svg>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: -90,
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: 'rgba(46,196,214,0.22)',
          ...(isRTL ? { right: -60 } : { left: -60 }),
        }}
      />
      {children}
    </Gradient>
  );
}
