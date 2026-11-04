// Add all / Reject all: how far along it is, so a long list doesn't look stuck (owner, 5 Nov: "Add progress bar").
import { View } from 'react-native';
import { AppText, ProgressBar } from '@/components/ui';
import { spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { NS } from './strings';

export function BulkProgress({ kind, done, total }: { kind: 'add' | 'reject'; done: number; total: number }) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  if (!total) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="caption" weight="bold" color="textSoft">
        {t(kind === 'add' ? 'bulkAdding' : 'bulkRejecting', { done: formatNumber(done, lang), total: formatNumber(total, lang) })}
      </AppText>
      <ProgressBar value={done / total} />
    </View>
  );
}
