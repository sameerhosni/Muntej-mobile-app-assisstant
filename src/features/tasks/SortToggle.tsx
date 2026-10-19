import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
import { colors, radius, shadows, sizes } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import type { Role } from '@/features/screens/registry';
import { SORT_MODES, type SortMode } from './model';
import { NS } from './strings';

type Props = { value: SortMode; onChange: (v: SortMode) => void; role?: Role; compact?: boolean };

/** Segmented Newest | Priority switch, in the role colour (blue manager, purple employee). */
export function SortToggle({ value, onChange, role = 'manager', compact }: Props) {
  const { t } = useScreenT(NS);
  const accent = role === 'employee' ? 'purple' : 'primary';
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('sortA11y')}
      style={{
        flexDirection: 'row',
        backgroundColor: colors.chip,
        borderRadius: radius.pill,
        padding: 3,
        alignSelf: compact ? 'auto' : 'stretch',
      }}
    >
      {SORT_MODES.map((mode) => {
        const on = value === mode;
        return (
          <Pressable
            key={mode}
            onPress={() => onChange(mode)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            hitSlop={compact ? { top: 4, bottom: 4 } : { top: 3, bottom: 3 }}
            style={{
              flex: compact ? undefined : 1,
              minHeight: compact ? 36 : sizes.touch - 6,
              paddingHorizontal: 14,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? colors.surface : colors.transparent,
              boxShadow: on ? shadows.tile : undefined,
            }}
          >
            <AppText variant="small" weight="bold" color={on ? accent : 'textMuted'}>
              {t(mode)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
