import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ban, Calendar, CircleAlert, CircleCheck, Plus, Trash2, Users } from 'lucide-react-native';
import { AppText, Avatar } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import type { Profile, TaskPriority } from '@/lib/api';
import { formatDue } from '@/features/capture/format';
import { personName } from '@/features/capture/TaskReview';
import type { CardTask, ChatAction, MissingItem } from './api';
import { contentDirection } from './Bubbles';
import { NS } from './strings';

const priorityStyle: Record<TaskPriority, { bg: ColorToken; fg: ColorToken }> = {
  urgent: { bg: 'redTint', fg: 'red' },
  high: { bg: 'redTint', fg: 'red' },
  medium: { bg: 'amberTint', fg: 'amberText' },
  low: { bg: 'chip', fg: 'textMuted' },
};

export type CardState = 'active' | 'cancelled' | 'deleted';

type Props = {
  task: CardTask;
  action: ChatAction;
  team: Profile[];
  state: CardState;
  /** only the person who assigned it (or the owner's manager) may delete; the server checks too */
  canDelete: boolean;
  /** the user asked to delete it in the chat → open with the delete confirmation */
  askDelete?: boolean;
  onCancel: () => Promise<void>;
  onDelete: () => Promise<void>;
  onMissing: (item: MissingItem) => void;
};

/** The task Muntej just created/updated, under its chat message. */
export function TaskCard({ task, action, team, state, canDelete, askDelete, onCancel, onDelete, onMissing }: Props) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(askDelete && canDelete ? 'delete' : null);
  const [working, setWorking] = useState(false);
  const undone = state !== 'active';

  const owner = team.find((p) => p.id === task.owner_id);
  const helper = team.find((p) => p.id === task.helper_id);
  const ownerName = owner ? personName(owner, lang) : task.owner_name;
  const helperName = helper ? personName(helper, lang).split(' ')[0] : task.helper_name;
  const pr = priorityStyle[task.priority];

  const run = async () => {
    setWorking(true);
    try {
      await (confirm === 'delete' ? onDelete() : onCancel());
      setConfirm(null);
    } finally {
      setWorking(false);
    }
  };

  return (
    <View
      style={{
        maxWidth: '94%',
        alignSelf: 'stretch',
        backgroundColor: undone ? colors.surfaceMuted : colors.surface,
        borderRadius: radius.tile,
        borderWidth: 1,
        borderColor: undone ? colors.border : colors.borderBlue,
        borderStartWidth: 4,
        borderStartColor: undone ? colors.textFaint : colors.primary,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {undone ? (
          state === 'deleted' ? <Trash2 color={colors.textMuted} size={13} strokeWidth={2.4} /> : <Ban color={colors.textMuted} size={13} strokeWidth={2.4} />
        ) : (
          <CircleCheck color={colors.greenText} size={13} strokeWidth={2.4} />
        )}
        <AppText variant="micro" weight="bold" color={undone ? 'textMuted' : 'greenText'}>
          {undone ? t(state) : action === 'updated' ? t('updated') : action === 'none' ? t('taskLabel') : t('created')}
        </AppText>
      </View>

      <AppText
        variant="cardTitle"
        weight="bold"
        color={undone ? 'textMuted' : 'text'}
        style={{ writingDirection: contentDirection(task.title), textDecorationLine: undone ? 'line-through' : 'none' }}
      >
        {task.title}
      </AppText>

      {!undone && (
        <>
          {/* owner + why */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {ownerName ? (
              <Avatar name={ownerName} size={28} />
            ) : (
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.amberTint, alignItems: 'center', justifyContent: 'center' }}>
                <Users color={colors.amberText} size={14} strokeWidth={2} />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="small" weight="bold" color={ownerName ? 'text' : 'amberText'} numberOfLines={1}>
                {ownerName ?? t('noOwner')}
              </AppText>
              {!!task.owner_reason && (
                <AppText variant="caption" color="textMuted" numberOfLines={2} style={{ writingDirection: contentDirection(task.owner_reason) }}>
                  {task.owner_reason}
                </AppText>
              )}
            </View>
          </View>

          {/* due + priority + helper */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Pill bg="primaryTint">
              <Calendar color={colors.primary} size={12} strokeWidth={2.2} />
              <AppText variant="caption" weight="semibold" color={task.due_at ? 'textSoft' : 'textMuted'}>
                {task.due_at ? formatDue(task.due_at, lang) : t('noDue')}
              </AppText>
            </Pill>
            <Pill bg={pr.bg}>
              <CircleAlert color={colors[pr.fg]} size={12} strokeWidth={2.4} />
              <AppText variant="caption" weight="bold" color={pr.fg}>
                {t(`p_${task.priority}`)}
              </AppText>
            </Pill>
            {!!helperName && (
              <Pill bg="purpleTint">
                <Avatar name={helperName} size={16} gradient="avatarPurple" />
                <AppText variant="caption" weight="semibold" color="purpleText">
                  {t('withHelper', { name: helperName })}
                </AppText>
              </Pill>
            )}
          </View>

          {task.missing.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <AppText variant="caption" weight="bold" color="amberStrong">
                {t('missing')}
              </AppText>
              {task.missing.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => onMissing(m)}
                  accessibilityRole="button"
                  accessibilityLabel={t('addMissing', { item: t(`m_${m}`) })}
                  hitSlop={{ top: 8, bottom: 8 }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    minHeight: 30,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: colors.amber,
                    backgroundColor: colors.amberTint,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Plus color={colors.amberStrong} size={12} strokeWidth={2.6} />
                  <AppText variant="caption" weight="bold" color="amberStrong">
                    {t(`m_${m}`)}
                  </AppText>
                </Pressable>
              ))}
            </View>
          )}

          {confirm ? (
            <View style={{ gap: spacing.sm, backgroundColor: colors.redTint, borderRadius: radius.md, padding: spacing.md }}>
              <AppText variant="small" weight="bold" color="red">
                {t(confirm === 'delete' ? 'confirmDelete' : 'confirmCancel')}
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <CardButton label={t('keep')} onPress={() => setConfirm(null)} />
                <CardButton label={t(confirm === 'delete' ? 'yesDelete' : 'yesCancel')} onPress={run} busy={working} danger />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <CardButton label={t('cancelTask')} onPress={() => setConfirm('cancel')}>
                <Ban color={colors.textSoft} size={15} strokeWidth={2.1} />
              </CardButton>
              {canDelete && (
                <CardButton label={t('delete')} onPress={() => setConfirm('delete')}>
                  <Trash2 color={colors.red} size={15} strokeWidth={2.1} />
                </CardButton>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function Pill({ bg, children }: { bg: ColorToken; children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors[bg],
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
      }}
    >
      {children}
    </View>
  );
}

function CardButton({
  label,
  onPress,
  danger,
  busy,
  children,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  busy?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: sizes.touch,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: danger ? colors.red : colors.border,
        backgroundColor: danger ? colors.red : colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={danger ? colors.onDark : colors.textSoft} />
      ) : (
        <>
          {children}
          <AppText variant="small" weight="bold" color={danger ? 'onDark' : 'textSoft'}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}
