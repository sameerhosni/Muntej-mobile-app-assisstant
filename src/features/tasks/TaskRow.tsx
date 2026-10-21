// One task in a list (Tasks page, objective page): tick + title + one line. Simplified for pilot users —
// priority, status, objective and missing fields live on the task screen (14), which a tap on the row opens.
//   one line: "Faisal · Thu 22 Oct"  |  red "Late · was due Mon 19 Oct"  |  green "Done ✓ · Ahmed will take a look"
//   a small red dot before the title = urgent / high priority
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Check, ChevronRight } from 'lucide-react-native';
import { AppText, Card } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { TOOL_LABEL, useTaskTools } from './toolTags';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTeam, type TaskWithPeople } from '@/lib/api';
import { formatDue } from '@/features/capture/format';
import { contentDirection } from '@/features/chat/Bubbles';
import { isLate } from './model';
import { isFinished, useCompleteTask } from './useCompleteTask';
import { NS } from './strings';

/** `hideObjective` is kept for callers; objectives are no longer shown on the row. */
export function TaskRow({ task }: { task: TaskWithPeople; hideObjective?: boolean }) {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const { toggle, canTick, busyId } = useCompleteTask();
  const me = useMyProfile();
  const team = useTeam();
  const tool = useTaskTools().data?.get(task.id);

  const finished = isFinished(task.status);
  const cancelled = task.status === 'cancelled';
  const late = isLate(task);
  const ownerName = task.owner ? ((lang === 'ar' && task.owner.full_name_ar) || task.owner.full_name).split(' ')[0] : null;
  // your own finished task waiting for the manager: for you it's done — the review isn't your status
  const mineWaiting = task.status === 'submitted' && !!me.data && task.owner_id === me.data.id;
  const reviewerId = mineWaiting ? (task.assigner_id !== me.data?.id ? task.assigner_id : me.data?.manager_id) : null;
  const reviewer = reviewerId ? (team.data ?? []).find((x) => x.id === reviewerId) : undefined;
  const reviewerName = reviewer ? ((lang === 'ar' && reviewer.full_name_ar) || reviewer.full_name).split(' ')[0] : null;

  // the one line under the title
  const due = task.due_at ? formatDue(task.due_at, lang) : null;
  let line: string;
  let lineColor: ColorToken = 'textMuted';
  if (cancelled) line = t('s_cancelled');
  else if (mineWaiting) {
    line = reviewerName ? t('lookingMine', { name: reviewerName }) : t('lookingMineNoName');
    lineColor = 'greenText';
  } else if (task.status === 'submitted') {
    line = `${ownerName ?? t('unassigned')} · ${t('s_submitted')}`;
    lineColor = 'purpleText';
  } else if (task.status === 'done') {
    line = `${ownerName ? `${ownerName} · ` : ''}${t('doneMine')}`;
    lineColor = 'greenText';
  } else if (late) {
    line = `${ownerName ? `${ownerName} · ` : ''}${t('lateLine', { when: due })}`;
    lineColor = 'red';
  } else line = `${ownerName ?? t('unassigned')} · ${due ?? t('noDue')}`;
  const hot = !finished && !cancelled && (task.priority === 'urgent' || task.priority === 'high');
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };

  return (
    // tick and row are siblings: a pressable can't sit inside another (nested <button> on web)
    <Card padding={spacing.md} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingStart: spacing.xs }}>
      {canTick(task) ? (
        <Pressable
          onPress={() => toggle(task)}
          disabled={busyId === task.id}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: finished, busy: busyId === task.id }}
          accessibilityLabel={t(finished ? 'tickReopen' : 'tickDone', { title: task.title })}
          style={({ pressed }) => ({ width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
        >
          {busyId === task.id ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : finished ? (
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: task.status === 'done' || mineWaiting ? colors.green : colors.purple,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Check color={colors.onDark} size={15} strokeWidth={3} />
            </View>
          ) : (
            <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: late ? colors.red : colors.borderDashed }} />
          )}
        </Pressable>
      ) : (
        <View style={{ width: spacing.md }} />
      )}

      <Pressable
        onPress={() => router.push({ pathname: '/14-task-detail', params: { id: task.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}. ${line}`}
        style={({ pressed }) => ({
          flex: 1,
          minWidth: 0,
          minHeight: sizes.touch,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {hot && <View accessibilityLabel={t(`p_${task.priority}`)} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.red }} />}
            <AppText
              weight="bold"
              numberOfLines={1}
              color={finished || cancelled ? 'textMuted' : 'text'}
              style={{ flexShrink: 1, textDecorationLine: cancelled || finished ? 'line-through' : 'none', writingDirection: contentDirection(task.title) }}
            >
              {task.title}
            </AppText>
            {tool && (
              // the tool this task lives in too (two-way sync)
              <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: colors.primaryTint }}>
                <AppText variant="micro" weight="bold" color="primary" numberOfLines={1}>
                  {TOOL_LABEL[tool.provider] ?? tool.provider}
                </AppText>
              </View>
            )}
          </View>
          <AppText variant="caption" weight={late || mineWaiting ? 'semibold' : 'regular'} color={lineColor} numberOfLines={1}>
            {line}
          </AppText>
        </View>
        <ChevronRight color={colors.textFaint} size={16} strokeWidth={2.2} style={flip} />
      </Pressable>
    </Card>
  );
}
