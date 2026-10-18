import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { colors, shadows, sizes } from '@/theme/tokens';

type Props = { label: string; onPress: () => void; children: ReactNode; variant?: 'white' | 'glass' };

/** Round 44px icon button: white with shadow (light screens) or glass (on a hero). */
export function IconButton({ label, onPress, children, variant = 'white' }: Props) {
  const glass = variant === 'glass';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: sizes.touch,
        height: sizes.touch,
        borderRadius: sizes.touch / 2,
        backgroundColor: glass ? colors.glass : colors.surface,
        borderWidth: glass ? 1 : 0,
        borderColor: colors.glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: glass ? undefined : shadows.tile,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}
