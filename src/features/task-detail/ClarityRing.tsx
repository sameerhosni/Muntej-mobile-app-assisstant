// Circular clarity score (TaskDetail.dc.html: r=30 ring in a 72 viewBox, 7px stroke, starts at 12 o'clock).
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppText } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { formatNumber } from '@/features/home/value';

const R = 30;
const CIRC = 2 * Math.PI * R;

export function ClarityRing({ pct, lang, label, size = 68 }: { pct: number; lang: string; label: string; size?: number }) {
  const value = Math.max(0, Math.min(100, pct));
  const stroke = value >= 100 ? colors.primary : colors.amberText;
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 72 72">
        <Circle cx={36} cy={36} r={R} fill="none" stroke={colors.track} strokeWidth={7} />
        <Circle
          cx={36}
          cy={36}
          r={R}
          fill="none"
          stroke={stroke}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${((CIRC * value) / 100).toFixed(1)} ${CIRC.toFixed(1)}`}
          transform="rotate(-90 36 36)"
        />
      </Svg>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="lead" weight="extrabold">
          {formatNumber(value, lang)}%
        </AppText>
      </View>
    </View>
  );
}
