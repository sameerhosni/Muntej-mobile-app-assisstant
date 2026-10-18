import { View } from 'react-native';
import { colors, type ColorToken } from '@/theme/tokens';

type Props = {
  /** 0..1 */
  value: number;
  color?: ColorToken;
  height?: number;
};

export function ProgressBar({ value, color = 'teal', height = 6 }: Props) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={{ height, borderRadius: height / 2, backgroundColor: colors.track, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: height / 2, backgroundColor: colors[color] }} />
    </View>
  );
}
