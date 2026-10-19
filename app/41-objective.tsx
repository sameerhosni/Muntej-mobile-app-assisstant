// Screen 41 · Objective — no mockup; v2 light style per design/TOKENS.md
// Live: one objective (?id=) with health, a GAPS list where each gap has a fix (distribute_tasks, chat focused on the
// task, link tasks), a mini timeline, linked tasks (unlink via link_task), edit (upsert_objective) and cancel.
// Without ?id= (prototype hub) it opens the most urgent visible objective.
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, CalendarX, ChevronLeft, ChevronRight, Clock, FileQuestion, Link2, Pencil, UserX, X } from 'lucide-react-native';
import { AppText, Avatar, Button, Card, IconBadge, IconButton } from '@/components/ui';
import { colors, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTasks, useTeam, type TaskWithPeople } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { TaskRow } from '@/features/tasks/TaskRow';
import {
  objectiveTitle,
  useCancelObjective,
  useDistributeTasks,
  useLinkTask,
  useObjective,
  useObjectives,
} from '@/features/objectives/api';
import { objectiveHealth, openCountByOwner, overloadedIds, useObjectivesHealth } from '@/features/objectives/health';
import { ObjectiveForm } from '@/features/objectives/ObjectiveForm';
import { ObjectiveTimeline } from '@/features/objectives/ObjectiveTimeline';
import { LinkTasksSheet } from '@/features/objectives/LinkTasksSheet';
import { ownerName, shortDate } from '@/features/objectives/ObjectiveCard';
import { DualBar, HealthChip, daysLeftText } from '@/features/objectives/visuals';
import { NS } from '@/features/objectives/strings';

const URGENCY = { atRisk: 0, behind: 1, onTrack: 2, achieved: 3, missed: 4, cancelled: 5 } as const;

const openTaskChat = (taskId?: string) =>
  router.push({ pathname: '/02-capture', params: taskId ? { mode: 'text', focus: taskId } : { mode: 'text' } });

export default function ObjectiveScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const all = useObjectives();
  const tasksAll = useTasks();
  const team = useTeam();
  const me = useMyProfile();
  const listHealth = useObjectivesHealth(all.data, tasksAll.data, team.data, me.data);
  // prototype hub opens 41 without an id: show the most urgent objective
  const fallbackId = useMemo(() => {
    if (params.id) return undefined;
    const sorted = [...(all.data ?? [])].sort(
      (a, b) =>
        URGENCY[listHealth.health.get(a.id)?.label ?? 'cancelled'] - URGENCY[listHealth.health.get(b.id)?.label ?? 'cancelled'] ||
        a.due_at.localeCompare(b.due_at),
    );
    return sorted[0]?.id;
  }, [params.id, all.data, listHealth.health]);
  const id = params.id ?? fallbackId;
  return <ObjectiveDetail id={id} waiting={!params.id && all.isLoading} />;
}

function ObjectiveDetail({ id, waiting }: { id: string | undefined; waiting: boolean }) {
  const { t } = useScreenT(NS);
  const { lang, isRTL, direction } = useDirection();
  const insets = useSafeAreaInsets();
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const n = (v: number) => formatNumber(v, lang);
  const { objective, tasks, data: o, linked, isLoading } = useObjective(id);
  const team = useTeam();
  const distribute = useDistributeTasks();
  const cancel = useCancelObjective();
  const link = useLinkTask();
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  const health = useMemo(() => {
    if (!o) return null;
    const overloaded = overloadedIds(team.data ?? [], openCountByOwner(tasks.data ?? []));
    return objectiveHealth(o, linked, overloaded);
  }, [o, linked, team.data, tasks.data]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/40-objectives'));
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <IconButton label={t('back')} onPress={back}>
        <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={flip} />
      </IconButton>
      <AppText variant="section" color="textMuted" style={{ flex: 1 }}>
        {t('detailTitle')}
      </AppText>
      {o && o.status !== 'cancelled' && (
        <IconButton label={t('edit')} onPress={() => setEditOpen(true)}>
          <Pencil color={colors.primary} size={18} strokeWidth={2} />
        </IconButton>
      )}
    </View>
  );

  if (waiting || isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.screen }}>
        {header}
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }
  if (!o || !health) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.screen, gap: spacing.xxl }}>
        {header}
        <AppText color="textMuted" align="center">
          {t('notFound')}
        </AppText>
        <Button label={t('title')} variant="outline" onPress={() => router.replace('/40-objectives')} />
      </SafeAreaView>
    );
  }

  const g = health.gaps;
  const active = o.status === 'active';
  const owner = ownerName(o, lang);
  const openWithDue = linked.filter((x) => x.status !== 'done' && x.status !== 'cancelled' && x.due_at).length;
  const sortedTasks = [...health.tasks].sort((a, b) => (a.due_at ?? '9').localeCompare(b.due_at ?? '9'));
  const cancelledTasks = linked.filter((x) => x.status === 'cancelled');
  const nameOf = (pid: string) => {
    const p = team.data?.find((x) => x.id === pid);
    return p ? ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0] : '';
  };

  const fitThemIn = async () => {
    setNotice(null);
    try {
      const moved = await distribute.mutateAsync(o.id);
      setNotice({ tone: 'green', text: t('fitDone', { count: moved, n: n(moved) }) });
    } catch (e) {
      setNotice({ tone: 'red', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const unlink = async (x: TaskWithPeople) => {
    setNotice(null);
    try {
      await link.mutateAsync({ taskId: x.id, objectiveId: null });
    } catch (e) {
      setNotice({ tone: 'red', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const doCancel = async () => {
    try {
      await cancel.mutateAsync(o.id);
      setConfirmCancel(false);
    } catch (e) {
      setNotice({ tone: 'red', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const showGaps = active && health.gapKinds > 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingTop: 20, paddingBottom: 48, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={(objective.isRefetching || tasks.isRefetching) && !isLoading}
            onRefresh={() => {
              objective.refetch();
              tasks.refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {header}

        {/* summary */}
        <Card padding={spacing.xxl} style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
            <AppText variant="title" display style={{ flex: 1 }}>
              {objectiveTitle(o, lang)}
            </AppText>
            <HealthChip label={health.label} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="caption" color="textMuted">
              {t('owner')}
            </AppText>
            {owner ? (
              <>
                <Avatar name={owner} size={22} />
                <AppText variant="small" weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {owner}
                </AppText>
              </>
            ) : (
              <AppText variant="small" weight="bold" color="amberText">
                {t('noOwner')}
              </AppText>
            )}
          </View>
          <DualBar health={health} height={12} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm }}>
            <AppText variant="caption" weight="bold" color="text">
              {t('progressLabel', { n: n(health.progress) })}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {t('timeLabel', { n: n(health.timeUsed) })}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm }}>
            <AppText variant="caption" color="textMuted">
              {t('window', { start: shortDate(o.start_at, lang), end: shortDate(o.due_at, lang) })}
            </AppText>
            {active && (
              <AppText variant="caption" weight="bold" color={health.daysLeft < 0 ? 'red' : 'textSoft'}>
                {daysLeftText(t, health.daysLeft, lang)}
              </AppText>
            )}
          </View>
          {!!o.description && (
            <AppText variant="small" color="textSoft">
              {o.description}
            </AppText>
          )}
        </Card>

        {notice && (
          <Card tone={notice.tone} padding={spacing.lg}>
            <AppText variant="small" weight="semibold" color={notice.tone === 'green' ? 'greenText' : 'red'}>
              {notice.text}
            </AppText>
          </Card>
        )}

        {/* gaps */}
        {showGaps && (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="cardTitle">{t('gapsHeader')}</AppText>
            {g.noTasks && (
              <GapCard Icon={FileQuestion} color="amberText" bg="amberTint" title={t('gap_noTasks')} sub={t('gap_noTasksSub')}>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button label={t('addTasks')} size="md" onPress={() => openTaskChat()} style={{ flex: 1 }} />
                  <Button label={t('linkTasks')} size="md" variant="outline" onPress={() => setLinkOpen(true)} style={{ flex: 1 }} />
                </View>
              </GapCard>
            )}
            {g.outsideWindow.length > 0 && (
              <GapCard
                Icon={CalendarX}
                color="red"
                bg="redTint"
                title={t('gap_outside', { count: g.outsideWindow.length, n: n(g.outsideWindow.length) })}
                sub={t('gap_outsideSub')}
              >
                <Button label={t('fitThemIn')} size="md" onPress={fitThemIn} loading={distribute.isPending} />
              </GapCard>
            )}
            {g.late.length > 0 && (
              <GapCard Icon={Clock} color="red" bg="redTint" title={t('gap_late', { count: g.late.length, n: n(g.late.length) })}>
                <TaskLinks tasks={g.late} label={t('fixInChat')} />
              </GapCard>
            )}
            {g.unassigned.length > 0 && (
              <GapCard
                Icon={UserX}
                color="amberText"
                bg="amberTint"
                title={t('gap_unassigned', { count: g.unassigned.length, n: n(g.unassigned.length) })}
              >
                <TaskLinks tasks={g.unassigned} label={t('fixInChat')} />
              </GapCard>
            )}
            {g.missingDoneWhen.length > 0 && (
              <GapCard
                Icon={FileQuestion}
                color="amberText"
                bg="amberTint"
                title={t('gap_dod', { count: g.missingDoneWhen.length, n: n(g.missingDoneWhen.length) })}
              >
                <TaskLinks tasks={g.missingDoneWhen} label={t('fixInChat')} />
              </GapCard>
            )}
            {g.overloadedOwners.length > 0 && (
              <GapCard
                Icon={AlertTriangle}
                color="amberText"
                bg="amberTint"
                title={t('gap_overloaded', {
                  names: g.overloadedOwners.map(nameOf).filter(Boolean).join(lang === 'ar' ? '، ' : ', '),
                  verb: g.overloadedOwners.length === 1 ? t('gap_overloadedVerbOne') : t('gap_overloadedVerbMany'),
                })}
                sub={t('gap_overloadedSub')}
              >
                <Button label={t('openLoad')} size="md" variant="outline" onPress={() => router.push('/11-load-radar')} />
              </GapCard>
            )}
          </View>
        )}

        {/* timeline */}
        <Card padding={spacing.xxl} style={{ gap: spacing.md }}>
          <AppText variant="cardTitle">{t('timelineHeader')}</AppText>
          <ObjectiveTimeline objective={o} tasks={health.tasks} />
        </Card>

        {/* tasks */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="cardTitle" style={{ flex: 1 }}>
            {t('tasksHeader', { n: n(health.total) })}
          </AppText>
          {o.status !== 'cancelled' && (
            <Button
              label={t('linkTasks')}
              size="md"
              variant="outline"
              icon={<Link2 color={colors.primary} size={16} strokeWidth={2.2} />}
              onPress={() => setLinkOpen(true)}
            />
          )}
        </View>
        {sortedTasks.length === 0 ? (
          <AppText variant="small" color="textMuted">
            {t('noTasksYet')}
          </AppText>
        ) : (
          [...sortedTasks, ...cancelledTasks].map((x) => (
            <View key={x.id} style={{ gap: 2 }}>
              <TaskRow task={x} hideObjective />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Pressable
                  onPress={() => unlink(x)}
                  disabled={link.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={t('unlinkA11y', { title: x.title })}
                  style={({ pressed }) => ({
                    minHeight: sizes.touch,
                    paddingHorizontal: spacing.lg,
                    justifyContent: 'center',
                    opacity: pressed || link.isPending ? 0.6 : 1,
                  })}
                >
                  <AppText variant="caption" weight="bold" color="textMuted">
                    {t('unlink')}
                  </AppText>
                </Pressable>
              </View>
            </View>
          ))
        )}

        {/* cancel */}
        {active && (
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            {confirmCancel ? (
              <Card tone="red" padding={spacing.lg} style={{ gap: spacing.md }}>
                <AppText variant="small" weight="semibold" color="red">
                  {t('cancelConfirm')}
                </AppText>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button label={t('keep')} size="md" variant="outline" onPress={() => setConfirmCancel(false)} style={{ flex: 1 }} />
                  <Button label={t('cancelYes')} size="md" tone="amber" onPress={doCancel} loading={cancel.isPending} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : (
              <Pressable
                onPress={() => setConfirmCancel(true)}
                accessibilityRole="button"
                style={({ pressed }) => ({ minHeight: sizes.touch, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
              >
                <AppText variant="small" weight="bold" color="red">
                  {t('cancelObjective')}
                </AppText>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      <LinkTasksSheet objectiveId={o.id} visible={linkOpen} onClose={() => setLinkOpen(false)} />

      <Modal visible={editOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditOpen(false)}>
        <View style={{ flex: 1, direction, backgroundColor: colors.bg, paddingTop: Platform.OS === 'android' ? insets.top : 0 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
              <IconButton label={t('close')} onPress={() => setEditOpen(false)}>
                <X color={colors.text} size={20} strokeWidth={2} />
              </IconButton>
            </View>
            {editOpen && <ObjectiveForm editing={o} retimeCount={openWithDue} onDone={() => setEditOpen(false)} />}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function GapCard({
  Icon,
  color,
  bg,
  title,
  sub,
  children,
}: {
  Icon: typeof Clock;
  color: ColorToken;
  bg: ColorToken;
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <Card padding={spacing.lg} style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <IconBadge size={34} bg={bg} round>
          <Icon color={colors[color]} size={16} strokeWidth={2.2} />
        </IconBadge>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="small" weight="bold">
            {title}
          </AppText>
          {!!sub && (
            <AppText variant="caption" color="textMuted">
              {sub}
            </AppText>
          )}
        </View>
      </View>
      {children}
    </Card>
  );
}

/** Each task as a tappable line that opens the chat focused on it. */
function TaskLinks({ tasks, label }: { tasks: TaskWithPeople[]; label: string }) {
  const { isRTL } = useDirection();
  return (
    <View style={{ gap: 2 }}>
      {tasks.map((x) => (
        <Pressable
          key={x.id}
          onPress={() => openTaskChat(x.id)}
          accessibilityRole="button"
          accessibilityLabel={`${label} · ${x.title}`}
          style={({ pressed }) => ({
            minHeight: sizes.touch,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <AppText variant="small" numberOfLines={1} style={{ flex: 1 }}>
            {x.title}
          </AppText>
          <AppText variant="caption" weight="bold" color="primary">
            {label}
          </AppText>
          <ChevronRight color={colors.primary} size={14} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </Pressable>
      ))}
    </View>
  );
}
