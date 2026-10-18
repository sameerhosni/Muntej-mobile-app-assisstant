// Decorative confetti shapes for the purple employee heroes (positions in % so they scale).
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';

type Piece = { kind: 'diamond' | 'triangle' | 'star' | 'dot' | 'bar'; x: `${number}%`; y: number; size: number; color: string; rotate?: number };

export function Confetti({ pieces }: { pieces: Piece[] }) {
  const { isRTL } = useDirection();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {pieces.map((p, i) => {
        const pos = { position: 'absolute' as const, top: p.y, ...(isRTL ? { right: p.x } : { left: p.x }) };
        if (p.kind === 'bar') {
          return (
            <View
              key={i}
              style={[pos, { width: p.size, height: 4, borderRadius: 2, backgroundColor: p.color, transform: [{ rotate: `${p.rotate ?? 30}deg` }] }]}
            />
          );
        }
        return (
          <Svg key={i} width={p.size} height={p.size} viewBox="0 0 24 24" style={pos}>
            {p.kind === 'diamond' && <Path d="M12 0l12 12-12 12L0 12z" fill={p.color} />}
            {p.kind === 'triangle' && <Path d="M12 2l10 20H2z" fill={p.color} />}
            {p.kind === 'star' && <Path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z" fill={p.color} />}
            {p.kind === 'dot' && <Circle cx={12} cy={12} r={12} fill={p.color} />}
          </Svg>
        );
      })}
    </View>
  );
}

export const HERO_CONFETTI: Piece[] = [
  { kind: 'diamond', x: '58%', y: 70, size: 12, color: colors.mint },
  { kind: 'triangle', x: '68%', y: 160, size: 12, color: colors.gold },
  { kind: 'star', x: '90%', y: 76, size: 13, color: colors.goldLight },
  { kind: 'dot', x: '50%', y: 124, size: 8, color: colors.purpleLight },
  { kind: 'bar', x: '92%', y: 176, size: 10, color: colors.onDark, rotate: 35 },
];
