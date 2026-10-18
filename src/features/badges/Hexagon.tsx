// Hexagon badge medal: tone gradient + soft white highlight, abbreviation on top.
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';
import { AppText } from '@/components/ui';
import { colors, type ColorToken } from '@/theme/tokens';

type Props = { id: string; color: ColorToken; dark: ColorToken; fill: ColorToken; label: string };

const OUTER = '23,0 46,12.5 46,37.5 23,50 0,37.5 0,12.5';
const INNER = '23,4 42,14.5 42,35.5 23,46 4,35.5 4,14.5';

export function Hexagon({ id, color, dark, fill, label }: Props) {
  return (
    <View style={{ width: 46, height: 50, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={46} height={50} viewBox="0 0 46 50" style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id={`hex-${id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors[color]} />
            <Stop offset="1" stopColor={colors[dark]} />
          </LinearGradient>
          <LinearGradient id={`hexhi-${id}`} x1="0" y1="0" x2="0.6" y2="1">
            <Stop offset="0" stopColor={colors.onDark} stopOpacity={0.32} />
            <Stop offset="0.6" stopColor={colors.onDark} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Polygon points={OUTER} fill={`url(#hex-${id})`} />
        <Polygon points={INNER} fill={`url(#hexhi-${id})`} />
      </Svg>
      <AppText variant="small" weight="extrabold" color={fill} display={false}>
        {label}
      </AppText>
    </View>
  );
}
