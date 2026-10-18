import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme/tokens';
import { Button } from './Button';

type Action = { label: string; onPress?: () => void; loading?: boolean; disabled?: boolean };

type Props = {
  primary: Action;
  /** Optional outline button next to the primary one (e.g. "Edit" on Capture). */
  secondary?: Action;
};

/** Sticky bottom action bar. Pair with <Screen bottomInset={BOTTOM_CTA_SPACE}>. */
export const BOTTOM_CTA_SPACE = 110;

export function BottomCTA({ primary, secondary }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: spacing.screen,
        paddingTop: spacing.lg,
        paddingBottom: Math.max(insets.bottom, spacing.xxl) + 8,
        backgroundColor: colors.bg,
        flexDirection: 'row',
        gap: spacing.md,
      }}
    >
      <Button {...primary} style={{ flex: 1 }} />
      {secondary && <Button {...secondary} variant="outline" tone="neutral" style={{ minWidth: 96 }} />}
    </View>
  );
}
