import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, type GradientToken } from '@/theme/tokens';

type Props = {
  name: GradientToken;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** 'diagonal' ≈ the mockups' 135–150°; 'horizontal' for progress fills. */
  direction?: 'diagonal' | 'horizontal';
};

/** Token-driven linear gradient (the mockups' `linear-gradient(150deg, …)`). */
export function Gradient({ name, style, children, direction = 'diagonal' }: Props) {
  return (
    <LinearGradient
      colors={gradients[name]}
      start={{ x: 0, y: 0 }}
      end={direction === 'horizontal' ? { x: 1, y: 0 } : { x: 1, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}
