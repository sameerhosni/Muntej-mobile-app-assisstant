// Diagonal stripes (the designs' repeating-linear-gradient(135deg, …)) drawn with an SVG pattern.
// Used for "likely delay" segments on screen 24 and the new-task impact on screen 11.
import { useId } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { colors, type ColorToken } from '@/theme/tokens';

type Props = {
  a: ColorToken;
  b: ColorToken;
  /** Width of one stripe in px (pattern = 2 stripes). */
  stripe?: number;
  style?: StyleProp<ViewStyle>;
};

export function Stripes({ a, b, stripe = 4, style }: Props) {
  const id = `stripes${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const size = stripe * 2;
  return (
    <View style={[{ overflow: 'hidden' }, style]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={id} patternUnits="userSpaceOnUse" width={size} height={size} patternTransform="rotate(45)">
            <Rect x={0} y={0} width={stripe} height={size} fill={colors[a]} />
            <Rect x={stripe} y={0} width={stripe} height={size} fill={colors[b]} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
