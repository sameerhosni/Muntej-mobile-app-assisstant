import { View } from 'react-native';
import { colors, type ColorToken } from '@/theme/tokens';
import { AppText } from './AppText';

type Props = {
  name: string;
  size?: number;
  bg?: ColorToken;
  fg?: ColorToken;
};

export function Avatar({ name, size = 40, bg = 'track', fg = 'text' }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors[bg],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText weight="bold" color={fg} style={{ fontSize: size * 0.4 }}>
        {initial}
      </AppText>
    </View>
  );
}
