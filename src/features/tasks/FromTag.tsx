// "From: Sameer" — who gave or asked for this work, the same purple pill everywhere a task appears (owner: "assigned
// from should be in every task with clear style"): task rows, the task page and tasks found in your tools.
import { View } from 'react-native';
import { CornerDownLeft, CornerDownRight } from 'lucide-react-native';
import { AppText } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';

const en = { from: 'From {{name}}', fromYou: 'From you' };
const ar: typeof en = { from: 'من {{name}}', fromYou: 'منك' };
const NS = registerStrings('fromTag', { en, ar });

export function FromTag({ name, you = false }: { name?: string | null; you?: boolean }) {
  const { t } = useScreenT(NS);
  const { isRTL } = useDirection();
  if (!you && !name) return null;
  const Icon = isRTL ? CornerDownLeft : CornerDownRight;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 3,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: colors.purpleTint,
        borderWidth: 1,
        borderColor: colors.purpleBorder,
      }}
    >
      <Icon color={colors.purple} size={12} strokeWidth={2.4} />
      <AppText variant="caption" weight="bold" color="purple" numberOfLines={1}>
        {you ? t('fromYou') : t('from', { name })}
      </AppText>
    </View>
  );
}
