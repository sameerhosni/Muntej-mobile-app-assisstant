import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Card, SectionTitle } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import type { Role } from '@/features/screens/registry';
import { useTaskList, type SortMode, type TaskListFilter } from './model';
import { SortToggle } from './SortToggle';
import { TaskRow } from './TaskRow';
import { NS } from './strings';

type Props = { filter?: Extract<TaskListFilter, 'all' | 'mine'>; limit?: number; role?: Role };

/** Home section: the newest (or most urgent) few tasks, with a link to the Tasks tab. */
export function LatestTasks({ filter = 'all', limit = 5, role: roleProp }: Props) {
  const { t } = useScreenT(NS);
  const [sort, setSort] = useState<SortMode>('newest');
  const list = useTaskList(filter, sort);
  const { query, rows } = list;
  const role = roleProp ?? list.role;
  const top = rows.slice(0, limit);

  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle title={t('latest')} actionLabel={t('seeAll')} onAction={() => router.navigate('/38-tasks')} />
      <SortToggle value={sort} onChange={setSort} role={role} />
      {query.isLoading ? (
        <ActivityIndicator color={role === 'employee' ? colors.purple : colors.primary} style={{ paddingVertical: spacing.xl }} />
      ) : top.length === 0 ? (
        <Card>
          <AppText color="textMuted">{t('homeEmpty')}</AppText>
        </Card>
      ) : (
        top.map((task) => <TaskRow key={task.id} task={task} />)
      )}
    </View>
  );
}
