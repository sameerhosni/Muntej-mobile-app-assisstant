// Screen 38 · Tasks — no mockup; v2 light style per design/TOKENS.md
// Live: every task the user may see (RLS). Changes go through the Muntej chat (02-capture) or one-tap ticks.
// Simplified (pilot feedback "too crowded"): three tabs — Mine (your open work) · Team (open work of others; shown to
// managers and anyone who assigns) · Done — with late tasks always on top. Sort and the rarer filters (All, I assigned,
// Late, Unassigned, No objective, Cancelled) live behind "⋯". Rows are one line; tapping opens the task.
// ?ids=a,b,c (Saree3's "Show me") shows exactly those tasks, with a banner to go back to the full list.
import { SetupBar } from '@/features/onboarding/SetupBar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SlidersHorizontal, X } from 'lucide-react-native';
import { AppText, Button, Card, Chip, SearchField } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { FILTERS, MORE_FILTERS, TABS, useTaskList, type SortMode, type TaskListFilter } from '@/features/tasks/model';
import { SortToggle } from '@/features/tasks/SortToggle';
import { TaskRow } from '@/features/tasks/TaskRow';
import { TourTarget } from '@/features/walkthrough/TourTarget';
import { useWalkthrough } from '@/features/walkthrough/useWalkthrough';
import { NS } from '@/features/tasks/strings';
import { Munti } from '@/features/munti/Munti';
import { MUNTI_NS } from '@/features/munti/tips';

const TASKS_STEPS = [
  { target: 'tasks.row', key: 'tasksRow', demo: 'tick' as const },
  { target: 'tasks.search', key: 'tasksSearch' },
];

export default function TasksScreen() {
  const { t } = useScreenT(NS);
  useWalkthrough('tasks', TASKS_STEPS);
  const { t: tm } = useScreenT(MUNTI_NS);
  const { lang } = useDirection();
  const insets = useSafeAreaInsets();
  const [sort, setSort] = useState<SortMode>('newest');
  // ?filter=late opens the list on that filter; ?ids= shows exactly the tasks Saree3 named
  const { filter: filterParam, ids: idsParam } = useLocalSearchParams<{ filter?: string; ids?: string }>();
  const onlyIds = typeof idsParam === 'string' && idsParam ? new Set(idsParam.split(',')) : null;
  const wanted = FILTERS.find((f) => f === filterParam);
  const [filter, setFilter] = useState<TaskListFilter>(wanted ?? 'mine');
  useEffect(() => {
    if (wanted) setFilter(wanted);
  }, [wanted]);
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState(false);
  const list = useTaskList(onlyIds ? 'all' : filter, sort, search);
  const { query, counts, role } = list;
  const rows = onlyIds ? list.rows.filter((x) => onlyIds.has(x.id)) : list.rows;
  const clearIds = () => router.setParams({ ids: undefined });
  const accent = role === 'employee' ? colors.purple : colors.primary;
  const hasAnyTask = (query.data?.length ?? 0) > 0;
  // "Team" only for managers and people who give tasks to others
  const tabs = TABS.filter((x) => x !== 'team' || role === 'manager' || counts.team > 0);
  const moreActive = !TABS.includes(filter);
  // nothing of your own but work for others (typical manager): open on "Team" — once, on first load
  const [autoPicked, setAutoPicked] = useState(false);
  // another account signed in on this phone: start again from "Mine"
  const meId = list.me.data?.id;
  useEffect(() => {
    if (!meId) return;
    setFilter(wanted ?? 'mine');
    setAutoPicked(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);
  useEffect(() => {
    if (autoPicked || wanted || query.isLoading || !query.data) return;
    setAutoPicked(true);
    if (counts.mine === 0 && counts.team > 0) setFilter('team');
  }, [autoPicked, wanted, query.isLoading, query.data, counts.mine, counts.team]);

  const resetView = () => {
    setFilter('mine');
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

      <SetupBar />

      {/* search + "⋯" (sort and the rarer filters) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <TourTarget id="tasks.search" style={{ flex: 1 }}>
          <SearchField value={search} onChangeText={setSearch} placeholder={t('searchPlaceholder')} clearLabel={t('clearSearch')} />
        </TourTarget>
        <Pressable
          onPress={() => setSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={t('moreA11y')}
          style={({ pressed }) => ({
            width: sizes.touch + 4,
            height: sizes.touch + 4,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: moreActive || sort !== 'newest' ? (role === 'employee' ? colors.purpleTint : colors.primaryTint) : colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <SlidersHorizontal color={accent} size={19} strokeWidth={2} />
        </Pressable>
      </View>

      {onlyIds ? (
        <Card tone="primary" padding={spacing.md} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="small" weight="bold" color="primary" style={{ flex: 1 }}>
            {t('fromSaree3', { count: rows.length })}
          </AppText>
          <Chip label={t('showAll')} onPress={clearIds} />
        </Card>
      ) : moreActive ? (
        // a filter from "⋯" is on: say which, with one tap back to the tabs
        <Card tone="primary" padding={spacing.md} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="small" weight="bold" color="primary" style={{ flex: 1 }}>
            {t('showing', { name: t(`f_${filter}`) })}
          </AppText>
          <Chip label={t('backToTabs')} onPress={() => setFilter('mine')} />
        </Card>
      ) : (
        // the three tabs
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.chip, borderRadius: radius.pill, padding: 3 }}>
          {tabs.map((x) => {
            const on = filter === x;
            return (
              <Pressable
                key={x}
                onPress={() => setFilter(x)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{
                  flex: 1,
                  minHeight: sizes.touch - 4,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? colors.surface : colors.transparent,
                  boxShadow: on ? shadows.tile : undefined,
                }}
              >
                <AppText weight="bold" color={on ? (role === 'employee' ? 'purple' : 'primary') : 'textMuted'}>
                  {t(`f_${x}`)} · {formatNumber(counts[x], lang)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}

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
    // Tasks exist but the search/tab hides them all.
    <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.md }}>
      <AppText color="textMuted" align="center">
        {filter === 'mine' && !search ? t('mineEmpty') : t('nothingHere')}
      </AppText>
      {(search || moreActive) && <Chip label={t('showAll')} onPress={resetView} />}
    </Card>
  ) : (
    <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl * 2, gap: spacing.md }}>
      <Munti size="lg" mood="sleep" />
      <AppText variant="cardTitle" align="center">
        {t('emptyTitle')}
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
        renderItem={({ item, index }) =>
          // the first row is the one Saree3's walkthrough lights up ("tap the circle when it's done")
          index === 0 ? (
            <TourTarget id="tasks.row">
              <TaskRow task={item} />
            </TourTarget>
          ) : (
            <TaskRow task={item} />
          )
        }
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingTop: 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={accent} />}
        showsVerticalScrollIndicator={false}
      />

      {/* "⋯": sort + the rarer filters */}
      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(11,26,51,0.35)' }} onPress={() => setSheet(false)} accessibilityLabel={t('close')} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.cardLg,
            borderTopRightRadius: radius.cardLg,
            padding: spacing.screen,
            paddingBottom: insets.bottom + spacing.xxl,
            gap: spacing.lg,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <AppText variant="section" style={{ flex: 1 }}>
              {t('sheetTitle')}
            </AppText>
            <Pressable
              onPress={() => setSheet(false)}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
              style={{ width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center' }}
            >
              <X color={colors.textMuted} size={20} strokeWidth={2} />
            </Pressable>
          </View>
          <View style={{ gap: spacing.sm }}>
            <AppText variant="small" weight="semibold" color="textMuted">
              {t('sortLabel')}
            </AppText>
            <SortToggle value={sort} onChange={setSort} role={role} />
          </View>
          <View style={{ gap: spacing.sm }}>
            <AppText variant="small" weight="semibold" color="textMuted">
              {t('showLabel')}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {MORE_FILTERS.map((f) => (
                <Chip
                  key={f}
                  label={`${t(`f_${f}`)} · ${formatNumber(counts[f], lang)}`}
                  selected={filter === f}
                  onPress={() => {
                    setFilter(f);
                    setSheet(false);
                  }}
                />
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
