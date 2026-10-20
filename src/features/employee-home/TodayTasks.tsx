// Screen 25 · Employee Home — "Today's tasks": the person's real open tasks (late first, then soonest due) as a checklist.
// Ticking one marks it done for real (set_task_status): someone else assigned it → it goes to them for review
// (submitted); self-assigned → done. Points go to the (demo) wallet and Munti cheers. Ticking again reopens it.
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { AppText, Gradient, PointsPill } from '@/components/ui';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTasks, useTeam, type TaskWithPeople } from '@/lib/api';
import { formatDue } from '@/features/capture/format';
import { formatNumber } from '@/features/home/value';
import { useWallet } from '@/features/rewards/wallet';
import { TASK_POINTS as PTS, useCompleteTask } from '@/features/tasks/useCompleteTask';
import { contentDirection } from '@/features/chat/Bubbles';
import { NS } from './strings';

const DAY = 86_400_000;
const MAX = 4;

export function TodayTasks() {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const me = useMyProfile();
  const team = useTeam();
  const tasks = useTasks();
  const w = useWallet();
  const { toggle, busyId: busy } = useCompleteTask();
  const n = (v: number) => formatNumber(v, lang);
  const meId = me.data?.id;

  // open ones (late first, then soonest due), plus the ones finished in the last day so the tick stays visible
  const rows = useMemo(() => {
    if (!meId) return [];
    const now = Date.now();
    const mine = (tasks.data ?? []).filter((x) => x.owner_id === meId && x.status !== 'cancelled');
    const dueMs = (x: TaskWithPeople) => (x.due_at ? Date.parse(x.due_at) : Number.MAX_SAFE_INTEGER);
    const open = mine.filter((x) => x.status !== 'done' && x.status !== 'submitted').sort((a, b) => dueMs(a) - dueMs(b));
    const finished = mine.filter((x) => (x.status === 'done' || x.status === 'submitted') && now - Date.parse(x.updated_at) < DAY);
    return [...finished, ...open].slice(0, MAX);
  }, [tasks.data, meId]);

  const nameOf = (id: string | null | undefined) => {
    const p = id ? (team.data ?? []).find((x) => x.id === id) : null;
    return p ? ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0] : null;
  };
  // who reviews: the person who assigned it, or my manager when I assigned it to myself
  const reviewerOf = (x: TaskWithPeople) => nameOf(x.assigner_id !== meId ? x.assigner_id : me.data?.manager_id);

  const now = Date.now();
  return (
    <View style={{ gap: spacing.md, marginTop: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="section">{t('quests')}</AppText>
        <PointsPill size="sm" label={t('ptsToday', { n: n(w.earnedToday) })} />
      </View>

      {tasks.isLoading && <ActivityIndicator color={colors.purple} style={{ alignSelf: 'flex-start' }} />}
      {!tasks.isLoading && rows.length === 0 && (
        <AppText color="textMuted">{t('tt_empty')}</AppText>
      )}

      {rows.map((x) => {
        const on = x.status === 'done' || x.status === 'submitted';
        const pts = PTS[x.priority] ?? 15;
        const late = !on && !!x.due_at && Date.parse(x.due_at) < now;
        const reviewer = reviewerOf(x);
        const hint =
          x.status === 'submitted'
            ? reviewer
              ? t('tt_review', { name: reviewer })
              : t('tt_reviewNoName')
            : x.status === 'done'
              ? t('tt_done')
              : x.due_at
                ? t(late ? 'tt_late' : 'tt_due', { when: formatDue(x.due_at, lang) })
                : t('tt_noDue');
        return (
          <Pressable
            key={x.id}
            onPress={() => toggle(x)}
            disabled={busy === x.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, busy: busy === x.id }}
            accessibilityLabel={t('tt_a11y', { name: x.title, n: n(pts), state: hint })}
            style={({ pressed }) => ({
              minHeight: 58,
              borderRadius: radius.button,
              borderWidth: 1,
              borderColor: on ? colors.purpleBorder : late ? colors.redTint : colors.border,
              backgroundColor: colors.surface,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.lg,
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.sm,
              boxShadow: shadows.tile,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            {busy === x.id ? (
              <ActivityIndicator size="small" color={colors.purple} style={{ width: 26 }} />
            ) : on ? (
              <Gradient name="purple" style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                <Check color={colors.onDark} size={15} strokeWidth={3} />
              </Gradient>
            ) : (
              <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: late ? colors.red : colors.borderDashed }} />
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <AppText
                weight="bold"
                numberOfLines={2}
                style={{ textDecorationLine: on ? 'line-through' : 'none', writingDirection: contentDirection(x.title) }}
              >
                {x.title}
              </AppText>
              <AppText variant="caption" color={late ? 'red' : on ? 'greenText' : 'textMuted'}>
                {hint}
              </AppText>
            </View>
            <View style={{ backgroundColor: colors.orangeTint, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
              <AppText weight="extrabold" color="orangeText" style={{ writingDirection: 'ltr' }}>
                +{n(pts)}
              </AppText>
            </View>
          </Pressable>
        );
      })}

    </View>
  );
}
