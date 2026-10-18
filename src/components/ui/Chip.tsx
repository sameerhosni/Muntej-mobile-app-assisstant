import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { AppText } from './AppText';

export type ChipTone = 'neutral' | 'teal' | 'amber' | 'red' | 'blue' | 'purple';

const toneStyle: Record<ChipTone, { bg: ColorToken; fg: ColorToken }> = {
  neutral: { bg: 'surface', fg: 'textSoft' },
  teal: { bg: 'tealDeep', fg: 'teal' },
  amber: { bg: 'amberDeep', fg: 'amber' },
  red: { bg: 'redDeep', fg: 'red' },
  blue: { bg: 'surface', fg: 'blue' },
  purple: { bg: 'surface', fg: 'purple' },
};

type Props = {
  label: string;
  tone?: ChipTone;
  dot?: boolean;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Chip({ label, tone = 'neutral', dot, selected, onPress, style }: Props) {
  const t = selected ? toneStyle.teal : toneStyle[tone];
  const body = (
    <View
      style={[
        {
          flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors[t.bg],
        borderRadius: radius.pill,
        paddingHorizontal: spacing.lg,
        paddingVertical: 6,
        borderWidth: selected ? 1 : 0,
        borderColor: colors.teal,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {dot && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors[t.fg] }} />}
      <AppText variant="caption" weight="medium" color={t.fg}>
        {label}
      </AppText>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      hitSlop={{ top: (sizes.touch - 28) / 2, bottom: (sizes.touch - 28) / 2 }}
    >
      {body}
    </Pressable>
  );
}
