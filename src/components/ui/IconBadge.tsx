import type { ReactNode } from 'react';
import { View } from 'react-native';
import { colors, type ColorToken, type GradientToken } from '@/theme/tokens';
import { Gradient } from './Gradient';

type Props = {
  children: ReactNode;
  size?: number;
  /** Tinted square (bg token) or gradient fill. */
  bg?: ColorToken;
  gradient?: GradientToken;
  round?: boolean;
};

/** The mockups' rounded tinted square holding a line icon. */
export function IconBadge({ children, size = 26, bg = 'primaryTint', gradient, round }: Props) {
  const r = round ? size / 2 : Math.round(size * 0.31);
  const style = { width: size, height: size, borderRadius: r, alignItems: 'center', justifyContent: 'center' } as const;
  if (gradient) {
    return (
      <Gradient name={gradient} style={style}>
        {children}
      </Gradient>
    );
  }
  return <View style={[style, { backgroundColor: colors[bg] }]}>{children}</View>;
}
