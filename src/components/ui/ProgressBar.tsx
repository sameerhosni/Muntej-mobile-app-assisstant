import { View } from 'react-native';
import { colors, type GradientToken } from '@/theme/tokens';
import { Gradient } from './Gradient';

type Props = {
  /** 0..1 */
  value: number;
  gradient?: GradientToken;
  height?: number;
};

export function ProgressBar({ value, gradient = 'avatarBlue', height = 8 }: Props) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={{ height, borderRadius: height / 2, backgroundColor: colors.track, overflow: 'hidden', flexDirection: 'row' }}
    >
      <Gradient name={gradient} direction="horizontal" style={{ width: `${pct}%`, borderRadius: height / 2 }} />
    </View>
  );
}
