import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@/theme/tokens';

export type CardTone = 'default' | 'alt' | 'inset' | 'teal' | 'amber' | 'red';

const toneBg: Record<CardTone, string> = {
  default: colors.surface,
  alt: colors.surfaceAlt,
  inset: colors.bg,
  teal: colors.tealDeep,
  amber: colors.amberDeep,
  red: colors.redDeep,
};

type Props = {
  children: ReactNode;
  tone?: CardTone;
  size?: 'md' | 'lg';
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, tone = 'default', size = 'lg', onPress, accessibilityLabel, style }: Props) {
  const base: ViewStyle = {
    backgroundColor: toneBg[tone],
    borderRadius: size === 'lg' ? radius.cardLg : radius.card,
    padding: size === 'lg' ? 20 : spacing.xxl,
    gap: spacing.xl,
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
