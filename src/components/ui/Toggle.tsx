import { Pressable, View } from 'react-native';
import { colors } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';

type Props = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  tone?: 'blue' | 'purple';
};

const W = 48;
const H = 28;
const KNOB = 22;

export function Toggle({ value, onValueChange, disabled, accessibilityLabel, tone = 'blue' }: Props) {
  const { isRTL } = useDirection();
  // Knob sits at the "end" side when on; in RTL the end is visually left.
  const onRight = value !== isRTL;
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      hitSlop={8}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <View
        style={{
          width: W,
          height: H,
          borderRadius: H / 2,
          backgroundColor: value ? (tone === 'purple' ? colors.purple : colors.primary) : colors.track,
          justifyContent: 'center',
          paddingHorizontal: (H - KNOB) / 2,
          direction: 'ltr',
          alignItems: onRight ? 'flex-end' : 'flex-start',
        }}
      >
        <View
          style={{
            width: KNOB,
            height: KNOB,
            borderRadius: KNOB / 2,
            backgroundColor: colors.surface,
            boxShadow: '0px 1px 3px rgba(11,42,91,0.25)',
          }}
        />
      </View>
    </Pressable>
  );
}
