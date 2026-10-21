// The manager's "Today" blocks for Home: the team at a glance (pulse), what Muntej is handling by itself, who needs
// support (Muntej is already following up), and your own tasks. The only one-tap action left is Approve finished work:
// chasing late work and checking on stuck people is the autopilot's job (supabase/functions/autopilot).
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, ChevronRight } from 'lucide-react-native';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { useMyProfile, useTasks, useTeam, type Profile, type TaskWithPeople } from '@/lib/api';
import { AppText, Avatar, Card, avatarGradientFor } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { DAY_MS, isOpen, personName, firstName, startOfWeek } from '@/features/dashboard/metrics';
import { inFilter, isLate } from '@/features/tasks/model';
import { TaskRow } from '@/features/tasks/TaskRow';
import { invalidateTaskData, setTaskStatus } from '@/features/chat/api';
import { formatNumber } from './value';
import { NS } from './strings';

const tasksLink = (ids: string[]): Href =>
  ids.length ? { pathname: '/38-tasks', params: { ids: ids.slice(0, 50).join(',') } } : '/38-tasks';

/** Small pill button for a row's one-tap action (≥44 touch area via hitSlop). */
export function ActionPill({
  label,
  doneLabel,
  tone = 'primary',
  onPress,
}: {
  label: string;
  doneLabel: string;
  tone?: 'primary' | 'green';
  onPress: () => Promise<boolean>;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const fg = tone === 'green' ? colors.green : colors.primary;
  const bg: ColorToken = tone === 'green' ? 'greenTint' : 'primaryTint';
  return (
    <Pressable
      onPress={async () => {
        if (state !== 'idle') return;
        setState('busy');
        setState((await onPress()) ? 'done' : 'idle');
      }}
      disabled={state !== 'idle'}
      accessibilityRole="button"
      accessibilityLabel={state === 'done' ? doneLabel : label}
      accessibilityState={{ disabled: state !== 'idle', busy: state === 'busy' }}
      hitSlop={{ top: (sizes.touch - 34) / 2, bottom: (sizes.touch - 34) / 2, left: 4, right: 4 }}
      style={({ pressed }) => ({
        minHeight: 34,
        minWidth: 72,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        backgroundColor: state === 'done' ? colors.chip : colors[bg],
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {state === 'busy' ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {state === 'done' && <Check color={colors.textMuted} size={14} strokeWidth={2.6} />}
          <AppText variant="small" weight="bold" style={{ color: state === 'done' ? colors.textMuted : fg }}>
            {state === 'done' ? doneLabel : label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

/** The one action a manager still takes from Home: approving finished work. (Chasing and check-ins are the autopilot's.) */
export function useTodayActions() {
  const qc = useQueryClient();
  return {
    /** Close a finished task (set_task_status approves the open review round). */
    approve: async (taskId: string) => {
      try {
        await setTaskStatus(taskId, 'done');
        await invalidateTaskData(qc);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** "Muntej is on it": what the autopilot is handling right now (late work it's chasing) and did today. Opens the log. */
export function MuntejHandling() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const me = useMyProfile();
  const tasks = useTasks();
  const meId = me.data?.id;
  const today = useQuery({
    queryKey: ['activity', 'muntejToday'],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from('activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('actor_type', 'muntej')
        .gte('created_at', start.toISOString());
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
  const late = (tasks.data ?? []).filter((x) => x.owner_id !== meId && isLate(x)).length;
  const done = today.data ?? 0;
  if (!late && !done) return null;
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const text = [
    late > 0 && t('handlingLate', { count: late, n: formatNumber(late, lang) }),
    done > 0 && t('handlingToday', { count: done, n: formatNumber(done, lang) }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={() => router.push('/03-autopilot')}
      accessibilityRole="link"
      accessibilityLabel={`${t('handlingTitle')}. ${text}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: sizes.touch + 8,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.tile,
        backgroundColor: colors.primaryTint,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Bot color={colors.primary} size={20} strokeWidth={2} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText weight="bold" color="primary">
          {t('handlingTitle')}
        </AppText>
        <AppText variant="caption" color="textMuted" numberOfLines={1}>
          {text}
        </AppText>
      </View>
      <ChevronRight color={colors.primary} size={16} strokeWidth={2.2} style={flip} />
    </Pressable>
  );
}

type Tile = { key: string; label: string; n: number; ids: string[]; fg: string; bg: ColorToken };

/** The team at a glance: working on · late · done this week · yours. Each number opens exactly those tasks. */
export function TeamPulse() {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const me = useMyProfile();
  const tasks = useTasks();
  const meId = me.data?.id;
  const now = Date.now();
  const weekStart = startOfWeek(new Date(now)).getTime();
  const all = (tasks.data ?? []).filter((x) => x.status !== 'cancelled');
  const team = all.filter((x) => x.owner_id !== meId);
  const late = team.filter((x) => isLate(x, now));
  const working = team.filter((x) => isOpen(x) && x.status !== 'submitted' && !isLate(x, now));
  const done = team.filter((x) => x.status === 'done' && new Date(x.closed_at ?? x.updated_at).getTime() >= weekStart);
  const mine = all.filter((x) => inFilter(x, 'mine', meId, now));
  const tiles: Tile[] = [
    { key: 'working', label: t('pulse_working'), n: working.length, ids: working.map((x) => x.id), fg: colors.primary, bg: 'primaryTint' },
    { key: 'late', label: t('pulse_late'), n: late.length, ids: late.map((x) => x.id), fg: colors.red, bg: 'redTint' },
    { key: 'done', label: t('pulse_done'), n: done.length, ids: done.map((x) => x.id), fg: colors.green, bg: 'greenTint' },
    { key: 'mine', label: t('pulse_mine'), n: mine.length, ids: mine.map((x) => x.id), fg: colors.purple, bg: 'purpleTint' },
  ];

  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="section">{t('pulseTitle')}</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {tiles.map((x) => (
          <Pressable
            key={x.key}
            onPress={() => router.push(tasksLink(x.ids))}
            disabled={x.n === 0}
            accessibilityRole="link"
            accessibilityLabel={`${x.label}: ${x.n}`}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 74,
              borderRadius: radius.tile,
              backgroundColor: colors[x.bg],
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              paddingHorizontal: 4,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <AppText variant="titleLg" style={{ color: x.n === 0 && x.key === 'late' ? colors.textMuted : x.fg }}>
              {formatNumber(x.n, lang)}
            </AppText>
            <AppText variant="micro" weight="bold" color="textSoft" align="center" numberOfLines={2}>
              {x.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

type Struggle = { p: Profile; late: number; blocked: number; returned: number; loadPct: number; ids: string[]; score: number };

/** People who look stuck: late, blocked, sent back, or booked over their week. Most in need first, max 3. */
export function NeedsSupport() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const me = useMyProfile();
  const team = useTeam();
  const tasks = useTasks();
  const meId = me.data?.id;
  const now = Date.now();
  const weekEnd = startOfWeek(new Date(now)).getTime() + 7 * DAY_MS;

  const people: Struggle[] = (team.data ?? [])
    .filter((p) => p.id !== meId)
    .map((p) => {
      const open = (tasks.data ?? []).filter((x) => x.owner_id === p.id && isOpen(x) && x.status !== 'submitted');
      const late = open.filter((x) => isLate(x, now));
      const blocked = open.filter((x) => x.status === 'blocked');
      const returned = open.filter((x) => x.status === 'returned');
      const hours = open
        .filter((x) => !!x.due_at && new Date(x.due_at).getTime() < weekEnd)
        .reduce((s, x) => s + (x.estimate_hours ?? 0), 0);
      const loadPct = Math.round((hours / (p.weekly_capacity_hours > 0 ? p.weekly_capacity_hours : 40)) * 100);
      const problem = [...late, ...blocked, ...returned];
      const ids = [...new Set((problem.length ? problem : open).map((x) => x.id))];
      const score = late.length * 3 + blocked.length * 2 + returned.length + (loadPct > 100 ? 2 : 0);
      return { p, late: late.length, blocked: blocked.length, returned: returned.length, loadPct, ids, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!team.data || !tasks.data || people.length === 0) return null;
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const n = (v: number) => formatNumber(v, lang);
  const why = (s: Struggle) =>
    [
      s.late > 0 && t('sup_late', { count: s.late, n: n(s.late) }),
      s.blocked > 0 && t('sup_blocked', { count: s.blocked, n: n(s.blocked) }),
      s.returned > 0 && t('sup_returned', { count: s.returned, n: n(s.returned) }),
      s.loadPct > 100 && t('sup_over', { pct: n(s.loadPct) }),
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="section">{t('supportTitle')}</AppText>
      <Card padding={spacing.sm} style={{ gap: 0 }}>
        {people.slice(0, 3).map((s, i) => {
          const name = personName(s.p, lang);
          return (
            // the row opens their stuck tasks; no button: Muntej is already following up with them
            <Pressable
              key={s.p.id}
              onPress={() => router.push(tasksLink(s.ids))}
              accessibilityRole="button"
              accessibilityLabel={`${name}. ${why(s)}. ${t('supOnIt')}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                minHeight: sizes.touch + 12,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Avatar name={s.p.full_name} size={34} gradient={avatarGradientFor(s.p.full_name)} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText weight="bold" numberOfLines={1}>
                  {firstName(name)}
                </AppText>
                <AppText variant="caption" color={s.late > 0 ? 'red' : 'textMuted'} numberOfLines={1}>
                  {why(s)}
                </AppText>
                <AppText variant="caption" color="primary" numberOfLines={1}>
                  {t('supOnIt')}
                </AppText>
              </View>
              <ChevronRight color={colors.textFaint} size={16} strokeWidth={2.2} style={flip} />
            </Pressable>
          );
        })}
        {people.length > 3 && (
          <Pressable
            onPress={() => router.push(tasksLink(people.flatMap((s) => s.ids)))}
            accessibilityRole="link"
            style={{ minHeight: sizes.touch, justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border }}
          >
            <AppText variant="small" weight="bold" color="primary">
              {t('seeAll', { count: people.length })}
            </AppText>
          </Pressable>
        )}
      </Card>
    </View>
  );
}

/** The manager's own open work: late first, then soonest due. Max 3, tick to finish. Hidden when there is none. */
export function MyTasks() {
  const { t } = useScreenT(NS);
  const me = useMyProfile();
  const tasks = useTasks();
  const meId = me.data?.id;
  const now = Date.now();
  const due = (x: TaskWithPeople) => (x.due_at ? Date.parse(x.due_at) : Infinity);
  const mine = (tasks.data ?? [])
    .filter((x) => inFilter(x, 'mine', meId, now))
    .sort((a, b) => Number(isLate(b, now)) - Number(isLate(a, now)) || due(a) - due(b));
  if (mine.length === 0) return null;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AppText variant="section" style={{ flex: 1 }}>
          {t('myTasksTitle')}
        </AppText>
        {mine.length > 3 && (
          <Pressable
            onPress={() => router.push({ pathname: '/38-tasks', params: { filter: 'mine' } })}
            accessibilityRole="link"
            hitSlop={8}
            style={{ minHeight: sizes.touch, justifyContent: 'center' }}
          >
            <AppText variant="small" weight="bold" color="primary">
              {t('seeAll', { count: mine.length })}
            </AppText>
          </Pressable>
        )}
      </View>
      <View style={{ gap: spacing.sm }}>
        {mine.slice(0, 3).map((x) => (
          <TaskRow key={x.id} task={x} />
        ))}
      </View>
    </View>
  );
}
