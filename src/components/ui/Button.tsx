import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { Gradient } from './Gradient';

type Variant = 'primary' | 'outline' | 'ghost';
type Tone = 'blue' | 'purple' | 'amber';

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

const toneText = { blue: 'primary', purple: 'purple', amber: 'amberText' } as const;
const toneBorder = { blue: colors.borderBlue, purple: colors.purpleBorder, amber: colors.gold } as const;

/** Pill button: primary = gradient fill with glow, outline = white with tinted border. */
export function Button({ label, onPress, variant = 'primary', tone = 'blue', size = 'lg', icon, loading, disabled, style }: Props) {
  const height = size === 'lg' ? sizes.buttonHeight : sizes.touch;
  const primary = variant === 'primary';
  const content = loading ? (
    <ActivityIndicator color={primary ? colors.onDark : colors[toneText[tone]]} />
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      {icon}
      <AppText variant={size === 'lg' ? 'lead' : 'cardTitle'} weight="bold" color={primary ? 'onDark' : toneText[tone]}>
        {label}
      </AppText>
    </View>
  );

  // the gradient is only a painted background (absolute fill) and never sizes the button: on Android a gradient in the
  // layout measured itself tall inside a centred column and stretched the button down the whole screen
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => [
        {
          minHeight: height,
          borderRadius: radius.pill,
          opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
          boxShadow: primary && !disabled ? (tone === 'purple' ? shadows.purple : shadows.primary) : undefined,
        },
        style,
      ]}
    >
      {primary ? (
        <View
          style={{
            minHeight: height,
            borderRadius: radius.pill,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.screen,
          }}
        >
          <Gradient
            name={tone === 'purple' ? 'purple' : tone === 'amber' ? 'warning' : 'primary'}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
          />
          {content}
        </View>
      ) : (
        <View
          style={{
            minHeight: height,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.xxl + 4,
            backgroundColor: variant === 'ghost' ? colors.transparent : colors.surface,
            borderWidth: variant === 'outline' ? 1 : 0,
            borderColor: toneBorder[tone],
          }}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}
