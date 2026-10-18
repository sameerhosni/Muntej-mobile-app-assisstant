import { View } from 'react-native';
import { colors, radius, spacing, type ColorToken } from '@/theme/tokens';
import { AppText } from './AppText';

type Props = {
  value: string | number;
  label: string;
  valueColor?: ColorToken;
};

export function StatTile({ value, label, valueColor = 'text' }: Props) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: 2,
      }}
    >
      <AppText variant="stat" mono weight="semibold" color={valueColor}>
        {value}
      </AppText>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}
