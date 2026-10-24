// Screen 39 · Team (org structure) — no mockup; v2 light style per design/TOKENS.md
// Live: everyone in profiles as a collapsible tree (top level = no manager). Search flattens to "name + path".
// Tap a person → sheet with details, skills and task numbers; Edit / Add under / Mark deleted per permission (RPC re-checks).
import { SetupBar } from '@/features/onboarding/SetupBar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Share2, UserPlus, X } from 'lucide-react-native';
import { AppText, Button, Card, FilterChips, IconButton, SearchField } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTasks } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import {
  canLead,
  displayName,
  editLevel,
  indexOrg,
  isAdminRole,
  managerChain,
  skillsOf,
  useOpenCounts,
  useOrg,
  type OrgIndex,
  type Person,
} from '@/features/org/model';
import { PersonRow } from '@/features/org/PersonRow';
import { TourTarget } from '@/features/walkthrough/TourTarget';
import { useWalkthrough } from '@/features/walkthrough/useWalkthrough';
import { PersonSheet } from '@/features/org/PersonSheet';
import { PersonForm, type FormMode } from '@/features/org/PersonForm';
import { QuickAdd } from '@/features/invite/QuickAdd';
import { Munti } from '@/features/munti/Munti';
import { MUNTI_NS } from '@/features/munti/tips';
import { NS } from '@/features/org/strings';

type StatusFilter = 'all' | 'active' | 'pending' | 'deleted';
const FILTERS: StatusFilter[] = ['all', 'active', 'pending', 'deleted'];
/** Levels 0 and 1 start open, so the first three levels show. */
const OPEN_DEPTH = 2;

const TEAM_STEPS = [
  { target: 'team.invite', key: 'teamInvite' },
  { target: 'team.person', key: 'teamPerson' },
];

export default function TeamScreen() {
  const { t } = useScreenT(NS);
  useWalkthrough('team', TEAM_STEPS);
  const { lang, isRTL, direction } = useDirection();
  const insets = useSafeAreaInsets();
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const org = useOrg();
  const tasks = useTasks();
  const { data: myProfile } = useMyProfile();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormMode | null>(null);

  const people = useMemo(() => org.data ?? [], [org.data]);
  const index = useMemo(() => indexOrg(people), [people]);
  const openCounts = useOpenCounts(tasks.data);
  const me = myProfile ? index.byId.get(myProfile.id) : undefined;
  const lead = canLead(me, people);

  const counts = useMemo(
    () => ({
      all: people.filter((p) => p.status !== 'deleted').length,
      active: people.filter((p) => p.status === 'active').length,
      pending: people.filter((p) => p.status === 'pending').length,
      deleted: people.filter((p) => p.status === 'deleted').length,
    }),
    [people],
  );

  const visible = useMemo(() => people.filter((p) => (filter === 'all' ? p.status !== 'deleted' : p.status === filter)), [people, filter]);
  const visibleIds = useMemo(() => new Set(visible.map((p) => p.id)), [visible]);

  const query = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return [];
    return visible.filter((p) =>
      [p.full_name, p.full_name_ar, p.title, p.title_ar, p.email, p.phone, ...p.skills, ...skillsOf(p).map((s) => s.name)].some((s) =>
        s?.toLowerCase().includes(query),
      ),
    );
  }, [visible, query]);

  // a visible person whose manager is hidden (deleted, filtered out) starts its own branch
  const roots = useMemo(() => visible.filter((p) => !p.manager_id || !visibleIds.has(p.manager_id)), [visible, visibleIds]);

  const pathOf = (p: Person) => {
    const chain = managerChain(p.id, index.byId);
    return chain.length ? chain.map((m) => displayName(m, lang)).join(t('pathSep')) : t('topLevel');
  };

  const selected = selectedId ? index.byId.get(selectedId) : undefined;
  const modalOpen = !!form || !!selected;
  const closeModal = () => {
    setForm(null);
    setSelectedId(null);
  };
  // the close button steps back from the form to the sheet it was opened from
  const closeTop = () => (form && selected ? setForm(null) : closeModal());

  const addTop = () => {
    setSelectedId(null);
    setForm({ kind: 'add', managerId: isAdminRole(me?.role) ? null : (me?.id ?? null) });
  };
  // ?add=1 ("Add team" from Everything Muntej does): open the add form once the profile is known
  const { add } = useLocalSearchParams<{ add?: string }>();
  const opened = useRef(false);
  useEffect(() => {
    if (add === '1' && me && !opened.current) {
      opened.current = true;
      addTop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [add, me]);

  const renderNode = (p: Person, depth: number): React.ReactNode => {
    const kids = (index.children.get(p.id) ?? []).filter((c) => visibleIds.has(c.id));
    const activeReports = (index.children.get(p.id) ?? []).filter((c) => c.status !== 'deleted').length;
    const open = toggled[p.id] ?? depth < OPEN_DEPTH;
    const isRoot = depth === 0;
    return (
      <View key={p.id} style={{ gap: spacing.sm }}>
        <PersonRow
          person={p}
          meId={me?.id}
          reports={activeReports}
          openTasks={openCounts.get(p.id) ?? 0}
          expanded={kids.length ? open : undefined}
          onToggle={() => setToggled((s) => ({ ...s, [p.id]: !open }))}
          onPress={() => setSelectedId(p.id)}
          subtitle={isRoot && p.manager_id ? pathOf(p) : undefined}
        />
        {kids.length > 0 && open && (
          <View
            style={{
              marginStart: spacing.xxl + 4,
              paddingStart: spacing.md,
              borderStartWidth: 1.5,
              borderStartColor: colors.borderBlue,
              gap: spacing.sm,
            }}
          >
            {kids.map((c) => renderNode(c, depth + 1))}
          </View>
        )}
      </View>
    );
  };

  const refreshing = (org.isRefetching || tasks.isRefetching) && !org.isLoading;

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
              org.refetch();
              tasks.refetch();
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
          {!org.isLoading && (
            <View
              accessibilityLabel={t('countA11y', { n: formatNumber(counts.all, lang) })}
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
                {formatNumber(counts.all, lang)}
              </AppText>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {/* invite with a code: WhatsApp, email or any app */}
          {lead && (
            <TourTarget id="team.invite">
              <IconButton label={t('inviteCode')} onPress={() => router.push('/48-invite')}>
                <Share2 color={colors.primary} size={20} strokeWidth={2} />
              </IconButton>
            </TourTarget>
          )}
          {lead && (
            <IconButton label={t('addTop')} onPress={addTop}>
              <UserPlus color={colors.primary} size={20} strokeWidth={2} />
            </IconButton>
          )}
        </View>

        <SetupBar />

        <SearchField value={search} onChangeText={setSearch} placeholder={t('searchPlaceholder')} clearLabel={t('clearSearch')} />

        <View accessibilityLabel={t('filtersA11y')}>
          <FilterChips options={FILTERS.map((f) => ({ key: f, label: t(`f_${f}`), count: counts[f] }))} value={filter} onChange={setFilter} />
        </View>

        {org.isError && (
          <Card tone="red" padding={spacing.lg}>
            <AppText variant="small" color="red">
              {t('loadError')}
            </AppText>
          </Card>
        )}

        {org.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : query ? (
          matches.length === 0 ? (
            <AppText color="textMuted" align="center" style={{ marginTop: spacing.xxl }}>
              {t('noMatch')}
            </AppText>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {matches.map((p) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  meId={me?.id}
                  reports={(index.children.get(p.id) ?? []).filter((c) => c.status !== 'deleted').length}
                  openTasks={openCounts.get(p.id) ?? 0}
                  onPress={() => setSelectedId(p.id)}
                  subtitle={pathOf(p)}
                />
              ))}
            </View>
          )
        ) : roots.length === 0 ? (
          <EmptyState onAdd={lead && filter === 'all' ? addTop : undefined} />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {roots.map((p, i) =>
              i === 0 ? (
                <TourTarget key={p.id} id="team.person">
                  {renderNode(p, 0)}
                </TourTarget>
              ) : (
                renderNode(p, 0)
              ),
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeTop}>
        {/* a Modal is its own root: set the language direction again */}
        <View style={{ flex: 1, direction, backgroundColor: colors.bg }}>
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                paddingHorizontal: spacing.screen,
                paddingTop: Platform.OS === 'ios' ? spacing.lg : insets.top + spacing.lg,
              }}
            >
              <IconButton label={t('close')} onPress={closeTop}>
                <X color={colors.text} size={20} strokeWidth={2} />
              </IconButton>
            </View>
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: spacing.screen,
                paddingTop: spacing.sm,
                paddingBottom: insets.bottom + 40,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {form?.kind === 'add' ? (
                // adding: one box (email, or name + email, several at once) + role + reports to
                <QuickAdd
                  key={`add-${form.managerId ?? 'top'}`}
                  managerId={form.managerId}
                  onDone={(id) => setSelectedId(id)}
                />
              ) : form ? (
                <PersonForm
                  key={`edit-${form.person.id}`}
                  mode={form}
                  me={me}
                  people={people}
                  index={index}
                  onDone={(id) => {
                    setForm(null);
                    setSelectedId(id);
                  }}
                />
              ) : selected ? (
                <PersonSheet
                  person={selected}
                  me={me}
                  people={people}
                  index={index}
                  tasks={tasks.data}
                  onEdit={() => setForm(editFormFor(me, selected, index))}
                  onAddUnder={() => setForm({ kind: 'add', managerId: selected.id })}
                />
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function editFormFor(me: Person | undefined, person: Person, index: OrgIndex): FormMode {
  return { kind: 'edit', person, selfOnly: editLevel(me, person, index.byId) === 'self' };
}

function EmptyState({ onAdd }: { onAdd?: () => void }) {
  const { t } = useScreenT(NS);
  const { t: tm } = useScreenT(MUNTI_NS);
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
      <Munti size="lg" mood="wave" settleAfter={4000} />
      <AppText variant="cardTitle" align="center">
        {t('emptyTitle')}
      </AppText>
      <AppText variant="small" color="textMuted" align="center">
        {t('emptyBody')}
      </AppText>
      <AppText variant="small" weight="semibold" color="primary" align="center">
        {tm('empty_team')}
      </AppText>
      {onAdd && <Button label={t('addTop')} size="md" onPress={onAdd} style={{ alignSelf: 'stretch' }} />}
    </Card>
  );
}
