import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { CircleCheck, Info, Mic } from 'lucide-react-native';
import { AppText, Avatar, Card, Chip } from '@/components/ui';
import type { ChipTone } from '@/components/ui/Chip';
import { colors, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import type { TaskPriority, TaskStatus, TaskWithPeople } from '@/lib/api';
import { formatDue } from '@/features/capture/format';
import { ObjectiveChip } from '@/features/objectives/ObjectiveChip';
import { missingFields } from './model';
import { NS } from './strings';

const priorityTone: Record<TaskPriority, ChipTone> = { low: 'neutral', medium: 'primary', high: 'amber', urgent: 'red' };

const statusTone: Record<TaskStatus, ChipTone> = {
  draft: 'neutral',
  assigned: 'primary',
  in_progress: 'primary',
  blocked: 'red',
  submitted: 'purple',
  returned: 'amber',
  done: 'green',
  cancelled: 'neutral',
};

/** Changes are conversational: open the Muntej chat locked on this task (typed or by voice). */
function openTaskChat(taskId: string, mode: 'text' | 'voice') {
  router.push({ pathname: '/02-capture', params: { mode, focus: taskId } });
}

/** `hideObjective`: leave out the objective chip (e.g. on that objective's own page). */
export function TaskRow({ task, hideObjective }: { task: TaskWithPeople; hideObjective?: boolean }) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();

  const done = task.status === 'done';
  const cancelled = task.status === 'cancelled';
  const ownerName = task.owner ? ((lang === 'ar' && task.owner.full_name_ar) || task.owner.full_name).split(' ')[0] : null;
  const missing = missingFields(task);

  return (
    // the row and the info button are siblings: a pressable can't sit inside another (nested <button> on web)
    <Card padding={spacing.lg} style={{ gap: spacing.xs, paddingEnd: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <Pressable
          onPress={() => openTaskChat(task.id, 'text')}
          accessibilityRole="button"
          accessibilityLabel={t('rowA11y', { title: task.title })}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 6, opacity: pressed ? 0.75 : 1 })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
            {done && <CircleCheck color={colors.green} size={18} strokeWidth={2.2} style={{ marginTop: 1 }} />}
            <AppText
              weight="bold"
              numberOfLines={2}
              color={done || cancelled ? 'textMuted' : 'text'}
              style={{ flexShrink: 1, textDecorationLine: cancelled ? 'line-through' : 'none' }}
            >
              {task.title}
            </AppText>
          </View>
  
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            {ownerName ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Avatar name={ownerName} size={20} />
                <AppText variant="caption" weight="semibold" color="textSoft">
                  {ownerName}
                </AppText>
              </View>
            ) : (
              <AppText variant="caption" weight="bold" color="amberText">
                {t('unassigned')}
              </AppText>
            )}
            <AppText variant="caption" color="textFaint">
              ·
            </AppText>
            <AppText variant="caption" color={task.due_at ? 'textMuted' : 'textFaint'}>
              {task.due_at ? formatDue(task.due_at, lang) : t('noDue')}
            </AppText>
          </View>
  
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Chip label={t(`p_${task.priority}`)} tone={priorityTone[task.priority]} />
            <Chip label={t(`s_${task.status}`)} tone={statusTone[task.status]} dot />
          </View>
  
          {missing.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber }} />
              <AppText variant="micro" weight="semibold" color="amberText" numberOfLines={1} style={{ flexShrink: 1 }}>
                {t('needs', { fields: missing.map((m) => t(`m_${m}`)).join(t('sep')) })}
              </AppText>
            </View>
          )}
        </Pressable>
  
        <Pressable
          onPress={() => openTaskChat(task.id, 'voice')}
          accessibilityRole="button"
          accessibilityLabel={t('micA11y', { title: task.title })}
          style={({ pressed }) => ({
            width: sizes.touch,
            height: sizes.touch,
            marginTop: -6,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Mic color={colors.primary} size={19} strokeWidth={2.1} />
        </Pressable>
  
        <Pressable
          onPress={() => router.push({ pathname: '/14-task-detail', params: { id: task.id } })}
          accessibilityRole="button"
          accessibilityLabel={t('detailsA11y', { title: task.title })}
          style={({ pressed }) => ({
            width: sizes.touch,
            height: sizes.touch,
            marginTop: -6,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Info color={colors.textFaint} size={19} strokeWidth={2} />
        </Pressable>
      </View>
      {/* sibling of the row pressable (not nested), so it can be its own link */}
      {task.objective_id && !hideObjective && <ObjectiveChip objectiveId={task.objective_id} />}
    </Card>
  );
}
