// Level ring for the employee hero: gradient progress stroke over a translucent track.
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors } from '@/theme/tokens';
import { AppText } from '@/components/ui';

type Props = { size?: number; progress: number; level: number; label: string };

const R = 60;
const CIRC = 2 * Math.PI * R;

export function LevelRing({ size = 124, progress, level, label }: Props) {
  const dash = CIRC * Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 150 150">
        <Defs>
          <LinearGradient id="levelRing" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.goldLight} />
            <Stop offset="0.55" stopColor={colors.purpleLight} />
            <Stop offset="1" stopColor={colors.mint} />
          </LinearGradient>
        </Defs>
        <Circle cx={75} cy={75} r={R} fill={colors.glass} stroke={colors.glassBorder} strokeWidth={13} />
        <Circle
          cx={75}
          cy={75}
          r={R}
          fill="none"
          stroke="url(#levelRing)"
          strokeWidth={13}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRC}`}
          transform="rotate(-90 75 75)"
        />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <AppText weight="extrabold" color="onDark" display={false} style={{ fontSize: 40, lineHeight: 44 }}>
          {level}
        </AppText>
        <AppText variant="caption" color="onDarkMuted">
          {label}
        </AppText>
      </View>
    </View>
  );
}
