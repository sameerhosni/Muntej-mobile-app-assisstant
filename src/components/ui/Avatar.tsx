import { View } from 'react-native';
import { colors, type GradientToken } from '@/theme/tokens';
import { AppText } from './AppText';
import { Gradient } from './Gradient';

type Props = {
  name: string;
  size?: number;
  /** Gradient fill (mockups use blue/purple/green/orange per person). */
  gradient?: GradientToken;
  /** White ring, e.g. on top of a hero or in overlapping stacks. */
  ring?: boolean;
};

const ROTATION: GradientToken[] = ['avatarBlue', 'avatarPurple', 'avatarGreen', 'avatarOrange'];

/** Stable gradient per person so the same name always gets the same color. */
export function avatarGradientFor(name: string): GradientToken {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ROTATION[h % ROTATION.length];
}

export function Avatar({ name, size = 40, gradient, ring }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: ring ? 2 : 0,
        borderColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      <Gradient
        name={gradient ?? avatarGradientFor(name)}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <AppText weight="extrabold" color="onDark" style={{ fontSize: size * 0.4 }}>
          {initial}
        </AppText>
      </Gradient>
    </View>
  );
}
