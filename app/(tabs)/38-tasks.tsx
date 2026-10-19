// Screen 38 · Tasks — no mockup; v2 light style per design/TOKENS.md
// Live: every task the user may see (RLS), newest or by priority. Changes go through the Muntej chat (02-capture).
// One search box + one chip row (All · Mine · I assigned · Late · Unassigned · Cancelled), counts follow the search.
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, Chip, FilterChips, SearchField } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { FILTERS, useTaskList, type SortMode, type TaskListFilter } from '@/features/tasks/model';
import { SortToggle } from '@/features/tasks/SortToggle';
import { TaskRow } from '@/features/tasks/TaskRow';
import { NS } from '@/features/tasks/strings';
import { Munti } from '@/features/munti/Munti';
import { MUNTI_NS } from '@/features/munti/tips';

export default function TasksScreen() {
  const { t } = useScreenT(NS);
  const { t: tm } = useScreenT(MUNTI_NS);
  const { lang } = useDirection();
  const [sort, setSort] = useState<SortMode>('newest');
  const [filter, setFilter] = useState<TaskListFilter>('all');
  const [search, setSearch] = useState('');
  const { query, rows, counts, role } = useTaskList(filter, sort, search);
  const accent = role === 'employee' ? colors.purple : colors.primary;
  const hasAnyTask = (query.data?.length ?? 0) > 0;

  const resetView = () => {
    setFilter('all');
    setSearch('');
  };

  const header = (
    <View style={{ gap: spacing.lg, marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <AppText variant="titleLg">{t('title')}</AppText>
        {!query.isLoading && (
          <View
            accessibilityLabel={t('countA11y', { n: formatNumber(rows.length, lang) })}
            style={{
              minWidth: 30,
              paddingHorizontal: spacing.sm,
              height: 26,
              borderRadius: radius.pill,
              backgroundColor: role === 'employee' ? colors.purpleTint : colors.primaryTint,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText variant="small" weight="extrabold" color={role === 'employee' ? 'purple' : 'primary'}>
              {formatNumber(rows.length, lang)}
            </AppText>
          </View>
        )}
      </View>

      <SortToggle value={sort} onChange={setSort} role={role} />

      <SearchField value={search} onChangeText={setSearch} placeholder={t('searchPlaceholder')} clearLabel={t('clearSearch')} />

      <View accessibilityLabel={t('filtersA11y')}>
        <FilterChips
          options={FILTERS.map((f) => ({ key: f, label: t(`f_${f}`), count: counts[f] }))}
          value={filter}
          onChange={setFilter}
        />
      </View>

      {query.isError && (
        <Card tone="red" padding={spacing.lg}>
          <AppText variant="small" color="red">
            {t('loadError')}
          </AppText>
        </Card>
      )}
    </View>
  );

  const empty = query.isLoading ? (
    <ActivityIndicator color={accent} style={{ paddingVertical: spacing.xxl * 2 }} />
  ) : query.isError ? null : hasAnyTask ? (
    // Tasks exist but the search/filter hides them all.
    <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.md }}>
      <AppText color="textMuted" align="center">
        {t('nothingHere')}
      </AppText>
      <Chip label={t('showAll')} onPress={resetView} />
    </Card>
  ) : (
    <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl * 2, gap: spacing.md }}>
      <Munti size="lg" mood="sleep" />
      <AppText variant="cardTitle" align="center">
        {t('emptyTitle')}
      </AppText>
      <AppText variant="small" color="textMuted" align="center">
        {t('emptyBody')}
      </AppText>
      <AppText variant="small" weight="semibold" color={role === 'employee' ? 'purpleText' : 'primary'} align="center">
        {tm('empty_tasks')}
      </AppText>
      <Button
        label={t('tellMuntej')}
        size="md"
        tone={role === 'employee' ? 'purple' : 'blue'}
        onPress={() => router.push({ pathname: '/02-capture', params: { mode: 'text' } })}
        style={{ marginTop: spacing.sm, alignSelf: 'center' }}
      />
    </Card>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => <TaskRow task={item} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingTop: 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={accent} />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
