// Screen 40 · Objectives — no mockup; v2 light style per design/TOKENS.md
// Live: objectives (RLS-scoped) with health = progress vs time used. Top "Gaps" strip, search + filter chips,
// "+ Objective" form (upsert_objective) and "Tell Muntej" (chat). Tap a card → screen 41 (detail).
import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, ChevronLeft, Link2Off, MessageSquare, Plus, Target, UserMinus, X } from 'lucide-react-native';
import { AppText, Avatar, Button, Card, Chip, FilterChips, IconBadge, IconButton, SearchField } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTasks, useTeam, type Profile } from '@/lib/api';
import { matchesSearch } from '@/lib/search';
import { formatNumber } from '@/features/home/value';
import { useObjectives } from '@/features/objectives/api';
import { useObjectivesHealth, type HealthLabel } from '@/features/objectives/health';
import { ObjectiveCard } from '@/features/objectives/ObjectiveCard';
import { ObjectiveForm } from '@/features/objectives/ObjectiveForm';
import { NS } from '@/features/objectives/strings';

type Filter = 'all' | 'atRisk' | 'onTrack' | 'achieved' | 'missed';
const FILTERS: Filter[] = ['all', 'atRisk', 'onTrack', 'achieved', 'missed'];
const ORDER: Record<HealthLabel, number> = { atRisk: 0, behind: 1, onTrack: 2, achieved: 3, missed: 4, cancelled: 5 };
const inFilter = (f: Filter, l: HealthLabel) => f === 'all' || f === l;

export default function ObjectivesScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL, direction } = useDirection();
  const insets = useSafeAreaInsets();
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const objectives = useObjectives();
  const tasks = useTasks();
  const team = useTeam();
  const me = useMyProfile();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [peopleOpen, setPeopleOpen] = useState<'overloaded' | 'noObjective' | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const n = (v: number) => formatNumber(v, lang);

  const { health, global, openCounts } = useObjectivesHealth(objectives.data, tasks.data, team.data, me.data);

  const searched = useMemo(
    () =>
      (objectives.data ?? []).filter((o) =>
        matchesSearch(search, o.title, o.title_ar, o.description, o.owner?.full_name, o.owner?.full_name_ar),
      ),
    [objectives.data, search],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f, searched.filter((o) => health.get(o.id) && inFilter(f, health.get(o.id)!.label)).length]),
      ) as Record<Filter, number>,
    [searched, health],
  );
  const rows = useMemo(
    () =>
      searched
        .filter((o) => health.get(o.id) && inFilter(filter, health.get(o.id)!.label))
        .sort((a, b) => ORDER[health.get(a.id)!.label] - ORDER[health.get(b.id)!.label] || a.due_at.localeCompare(b.due_at)),
    [searched, health, filter],
  );

  const loading = objectives.isLoading || tasks.isLoading;
  const refreshing = (objectives.isRefetching || tasks.isRefetching) && !loading;
  const total = objectives.data?.length ?? 0;
  const peopleList: Profile[] = peopleOpen === 'overloaded' ? global.overloaded : peopleOpen === 'noObjective' ? global.withoutObjective : [];
  const tellMuntej = () => router.push({ pathname: '/02-capture', params: { mode: 'text' } });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingTop: 20, paddingBottom: 40, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              objectives.refetch();
              tasks.refetch();
              team.refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconButton label={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={flip} />
          </IconButton>
          <AppText variant="titleLg" style={{ flexShrink: 1 }}>
            {t('title')}
          </AppText>
          {!loading && (
            <View
              accessibilityLabel={t('countA11y', { n: n(total) })}
              style={{
                minWidth: 30,
                paddingHorizontal: spacing.sm,
                height: 26,
                borderRadius: radius.pill,
                backgroundColor: colors.primaryTint,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText variant="small" weight="extrabold" color="primary">
                {n(total)}
              </AppText>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            label={t('addObjective')}
            size="md"
            icon={<Plus color={colors.onDark} size={18} strokeWidth={2.4} />}
            onPress={() => setFormOpen(true)}
            style={{ flex: 1 }}
          />
          <Button
            label={t('tellMuntej')}
            size="md"
            variant="outline"
            icon={<MessageSquare color={colors.primary} size={17} strokeWidth={2.2} />}
            onPress={tellMuntej}
            style={{ flex: 1 }}
          />
        </View>

        {/* Gaps strip */}
        {!loading && (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="small" weight="bold" color="textMuted">
              {t('gapsTitle')}
            </AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -spacing.screen, flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: spacing.screen, gap: spacing.sm, paddingVertical: 2 }}
            >
              <GapPill
                label={t('g_unlinked', { n: n(global.unlinked.length) })}
                Icon={Link2Off}
                tone={global.unlinked.length ? 'amber' : 'neutral'}
                onPress={() => router.push('/38-tasks')}
              />
              <GapPill
                label={t('g_atRisk', { n: n(global.atRisk) })}
                Icon={AlertTriangle}
                tone={global.atRisk ? 'red' : 'neutral'}
                selected={filter === 'atRisk'}
                onPress={() => setFilter(filter === 'atRisk' ? 'all' : 'atRisk')}
              />
              <GapPill
                label={t('g_overloaded', { n: n(global.overloaded.length) })}
                Icon={AlertTriangle}
                tone={global.overloaded.length ? 'amber' : 'neutral'}
                selected={peopleOpen === 'overloaded'}
                onPress={() => setPeopleOpen(peopleOpen === 'overloaded' ? null : 'overloaded')}
              />
              <GapPill
                label={t('g_noObjective', { n: n(global.withoutObjective.length) })}
                Icon={UserMinus}
                tone={global.withoutObjective.length ? 'amber' : 'neutral'}
                selected={peopleOpen === 'noObjective'}
                onPress={() => setPeopleOpen(peopleOpen === 'noObjective' ? null : 'noObjective')}
              />
            </ScrollView>
            {peopleOpen && (
              <Card padding={spacing.lg} style={{ gap: spacing.sm }}>
                <AppText variant="caption" color="textMuted">
                  {peopleOpen === 'overloaded' ? t('overloadedList') : t('noObjectiveList')}
                </AppText>
                {peopleList.length === 0 ? (
                  <AppText variant="small" color="textMuted">
                    {t('noGaps')}
                  </AppText>
                ) : (
                  peopleList.map((p) => {
                    const name = (lang === 'ar' && p.full_name_ar) || p.full_name;
                    return (
                      <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 }}>
                        <Avatar name={name} size={24} />
                        <AppText variant="small" weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                          {name}
                        </AppText>
                        <AppText variant="caption" color="textMuted">
                          {t('openTasksN', { n: n(openCounts.get(p.id) ?? 0) })}
                        </AppText>
                      </View>
                    );
                  })
                )}
              </Card>
            )}
          </View>
        )}

        <SearchField value={search} onChangeText={setSearch} placeholder={t('searchPlaceholder')} clearLabel={t('clearSearch')} />
        <View accessibilityLabel={t('filtersA11y')}>
          <FilterChips
            options={FILTERS.map((f) => ({ key: f, label: t(`f_${f}`), count: counts[f] }))}
            value={filter}
            onChange={setFilter}
          />
        </View>

        {objectives.isError && (
          <Card tone="red" padding={spacing.lg}>
            <AppText variant="small" color="red">
              {t('loadError')}
            </AppText>
          </Card>
        )}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : total === 0 ? (
          <Card padding={spacing.xxl} style={{ alignItems: 'center', gap: spacing.md }}>
            <IconBadge size={48} bg="primaryTint" round>
              <Target color={colors.primary} size={22} strokeWidth={2} />
            </IconBadge>
            <AppText variant="cardTitle" align="center">
              {t('emptyTitle')}
            </AppText>
            <AppText variant="small" color="textMuted" align="center">
              {t('emptyBody')}
            </AppText>
          </Card>
        ) : rows.length === 0 ? (
          <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg }}>
            <AppText color="textMuted" align="center">
              {t('nothingHere')}
            </AppText>
            <Chip
              label={t('showAll')}
              onPress={() => {
                setFilter('all');
                setSearch('');
              }}
            />
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {rows.map((o) => (
              <ObjectiveCard key={o.id} objective={o} health={health.get(o.id)!} />
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={formOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFormOpen(false)}>
        {/* a Modal is its own root: set the language direction again */}
        <View style={{ flex: 1, direction, backgroundColor: colors.bg, paddingTop: Platform.OS === 'android' ? insets.top : 0 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
              <IconButton label={t('close')} onPress={() => setFormOpen(false)}>
                <X color={colors.text} size={20} strokeWidth={2} />
              </IconButton>
            </View>
            {formOpen && (
              <ObjectiveForm
                onDone={(id) => {
                  setFormOpen(false);
                  router.push({ pathname: '/41-objective', params: { id } });
                }}
              />
            )}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const pillTone: Record<'neutral' | 'amber' | 'red', { bg: ColorToken; fg: ColorToken }> = {
  neutral: { bg: 'surface', fg: 'textMuted' },
  amber: { bg: 'amberTint', fg: 'amberText' },
  red: { bg: 'redTint', fg: 'red' },
};

function GapPill({
  label,
  Icon,
  tone,
  selected,
  onPress,
}: {
  label: string;
  Icon: typeof Plus;
  tone: 'neutral' | 'amber' | 'red';
  selected?: boolean;
  onPress: () => void;
}) {
  const c = pillTone[tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => ({
        minHeight: sizes.touch,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        backgroundColor: colors[c.bg],
        borderWidth: 1.5,
        borderColor: selected ? colors[c.fg] : tone === 'neutral' ? colors.borderBlue : colors.transparent,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Icon color={colors[c.fg]} size={15} strokeWidth={2.2} />
      <AppText variant="small" weight="bold" color={c.fg}>
        {label}
      </AppText>
    </Pressable>
  );
}
