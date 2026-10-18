import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadows, spacing } from '@/theme/tokens';

export type CardTone = 'default' | 'muted' | 'primary' | 'green' | 'amber' | 'purple' | 'orange' | 'red';

const toneBg: Record<CardTone, string> = {
  default: colors.surface,
  muted: colors.surfaceMuted,
  primary: colors.primaryTint,
  green: colors.greenTint,
  amber: colors.amberTint,
  purple: colors.purpleTint,
  orange: colors.orangeTint,
  red: colors.redTint,
};

type Props = {
  children: ReactNode;
  tone?: CardTone;
  /** 'raised' = the stronger shadow used for cards overlapping a hero. */
  elevation?: 'flat' | 'card' | 'raised';
  padding?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** White rounded card with the mockups' soft blue shadow. */
export function Card({
  children,
  tone = 'default',
  elevation = 'card',
  padding = spacing.xl,
  onPress,
  accessibilityLabel,
  style,
}: Props) {
  const base: ViewStyle = {
    backgroundColor: toneBg[tone],
    borderRadius: radius.card,
    padding,
    gap: spacing.lg,
    boxShadow: tone === 'default' && elevation !== 'flat' ? shadows[elevation === 'raised' ? 'raised' : 'card'] : undefined,
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [base, { opacity: pressed ? 0.88 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
