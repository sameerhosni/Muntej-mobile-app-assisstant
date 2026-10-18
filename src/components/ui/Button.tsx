import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { AppText } from './AppText';

type Variant = 'primary' | 'outline';
type Tone = 'teal' | 'amber' | 'neutral';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  tone?: Tone;
  size?: 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const toneColor = { teal: colors.teal, amber: colors.amber, neutral: colors.border } as const;

export function Button({
  label,
  onPress,
  variant = 'primary',
  tone = 'teal',
  size = 'lg',
  icon,
  loading,
  disabled,
  style,
}: Props) {
  const isPrimary = variant === 'primary';
  const accent = toneColor[tone];
  const textColor = isPrimary ? 'onTeal' : tone === 'neutral' ? 'text' : tone;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => [
        {
          minHeight: size === 'lg' ? sizes.buttonHeight + 4 : sizes.touch,
          borderRadius: size === 'lg' ? radius.card : radius.md,
          paddingHorizontal: spacing.xxl + 4,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isPrimary ? accent : colors.surface,
          borderWidth: isPrimary ? 0 : 1.5,
          borderColor: isPrimary ? colors.transparent : accent,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onTeal : accent} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {icon}
          <AppText variant={size === 'lg' ? 'lead' : 'cardTitle'} weight="extrabold" color={textColor}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}
