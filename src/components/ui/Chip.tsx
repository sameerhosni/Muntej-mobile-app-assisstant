import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { AppText } from './AppText';

export type ChipTone = 'neutral' | 'primary' | 'green' | 'amber' | 'red' | 'purple' | 'orange';

const toneStyle: Record<ChipTone, { bg: ColorToken; fg: ColorToken }> = {
  neutral: { bg: 'chip', fg: 'textMuted' },
  primary: { bg: 'primaryTint', fg: 'primary' },
  green: { bg: 'greenTint', fg: 'greenText' },
  amber: { bg: 'amberTint', fg: 'amberText' },
  red: { bg: 'redTint', fg: 'red' },
  purple: { bg: 'purpleTint', fg: 'purple' },
  orange: { bg: 'orangeTint', fg: 'orangeText' },
};

type Props = {
  label: string;
  tone?: ChipTone;
  dot?: boolean;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Rounded pill. Selectable chips render white with a border, selected = primary tint. */
export function Chip({ label, tone = 'neutral', dot, selected, onPress, style }: Props) {
  const selectable = !!onPress;
  const t = selected ? toneStyle.primary : toneStyle[tone];
  const body = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: selectable && !selected ? colors.surface : colors[t.bg],
          borderRadius: radius.pill,
          paddingHorizontal: spacing.lg,
          minHeight: selectable ? 36 : 24,
          justifyContent: 'center',
          borderWidth: selectable ? 1 : 0,
          borderColor: selected ? colors.primary : colors.borderBlue,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {dot && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors[t.fg] }} />}
      <AppText variant={selectable ? 'small' : 'caption'} weight="bold" color={selectable && !selected ? 'text' : t.fg}>
        {label}
      </AppText>
    </View>
  );
  if (!selectable) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      hitSlop={{ top: (sizes.touch - 36) / 2, bottom: (sizes.touch - 36) / 2 }}
    >
      {body}
    </Pressable>
  );
}
