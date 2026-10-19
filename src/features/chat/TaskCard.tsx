import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { ArrowLeft, ArrowRight, Ban, Calendar, CircleAlert, CircleCheck, Crosshair, Plus, Trash2, Users } from 'lucide-react-native';
import { AppText, Avatar } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import type { Profile, TaskPriority } from '@/lib/api';
import { formatDue } from '@/features/capture/format';
import { personName } from '@/features/capture/TaskReview';
import type { CardTask, ChatAction, MissingItem, ProposedPatch, TaskSnapshot } from './api';
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
  /** lock the chat on this task */
  onTalkAbout?: () => void;
};

/** The task Muntej just created/updated, under its chat message. */
export function TaskCard({ task, action, team, state, canDelete, askDelete, onCancel, onDelete, onMissing, onTalkAbout }: Props) {
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

          {!!onTalkAbout && (
            <Pressable
              onPress={onTalkAbout}
              accessibilityRole="button"
              accessibilityLabel={t('talkAbout')}
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
                minHeight: sizes.touch,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingEnd: spacing.sm,
                marginVertical: -spacing.sm,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Crosshair color={colors.primary} size={14} strokeWidth={2.2} />
              <AppText variant="small" weight="bold" color="primary">
                {t('talkAbout')}
              </AppText>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

/** open = can be confirmed now; rejected = "Not this one"; confirmed = a later message updated the task; stale = never confirmed */
export type ProposalState = 'open' | 'rejected' | 'confirmed' | 'stale';

const PATCH_FIELDS = ['title', 'owner_id', 'helper_id', 'due_at', 'priority', 'definition_of_done', 'budget', 'goal'] as const;
type PatchField = (typeof PATCH_FIELDS)[number];
const fieldLabel: Record<PatchField, string> = {
  title: 'f_title',
  owner_id: 'f_owner',
  helper_id: 'f_helper',
  due_at: 'f_due',
  priority: 'f_priority',
  definition_of_done: 'f_definition_of_done',
  budget: 'f_budget',
  goal: 'f_goal',
};

/** A change Muntej proposes for a task the user described: nothing changes until Confirm. */
export function ProposalCard({
  snap,
  team,
  state,
  onConfirm,
  onReject,
}: {
  /** the task as it was when proposed (old values) + proposed_patch */
  snap: TaskSnapshot;
  team: Profile[];
  state: ProposalState;
  onConfirm: () => Promise<void>;
  onReject: () => void;
}) {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const [working, setWorking] = useState(false);
  const patch: ProposedPatch = snap.proposed_patch ?? {};
  const open = state === 'open';
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  const person = (id: string | null | undefined, fallback?: string | null) => {
    const p = id ? team.find((x) => x.id === id) : undefined;
    return p ? personName(p, lang).split(' ')[0] : fallback ? fallback.split(' ')[0] : t('none');
  };
  const due = (iso: string | null | undefined) => (iso ? formatDue(iso, lang) : t('noDue'));

  const rows = PATCH_FIELDS.filter((f) => f in patch).map((f) => {
    switch (f) {
      case 'owner_id':
        return { f, from: person(snap.owner_id, snap.owner_name), to: person(patch.owner_id, snap.proposed_owner_name) };
      case 'helper_id':
        return { f, from: snap.helper_name ? snap.helper_name.split(' ')[0] : t('none'), to: person(patch.helper_id) };
      case 'due_at':
        return { f, from: due(snap.due_at), to: due(patch.due_at) };
      case 'priority':
        return { f, from: t(`p_${snap.priority}`), to: patch.priority ? t(`p_${patch.priority}`) : t('none') };
      default:
        return { f, from: null, to: (patch[f] as string | null | undefined) || t('none') };
    }
  });

  const confirm = async () => {
    setWorking(true);
    try {
      await onConfirm();
    } finally {
      setWorking(false);
    }
  };

  const label = state === 'rejected' ? t('notChanged') : state === 'confirmed' ? t('updated') : state === 'stale' ? t('notConfirmed') : t('proposed');
  const labelColor: ColorToken = open ? 'amberStrong' : state === 'confirmed' ? 'greenText' : 'textMuted';

  return (
    <View
      style={{
        maxWidth: '94%',
        alignSelf: 'stretch',
        backgroundColor: open ? colors.surface : colors.surfaceMuted,
        borderRadius: radius.tile,
        borderWidth: 1,
        borderColor: open ? colors.amber : colors.border,
        borderStartWidth: 4,
        borderStartColor: open ? colors.amber : colors.textFaint,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {state === 'confirmed' ? (
          <CircleCheck color={colors.greenText} size={13} strokeWidth={2.4} />
        ) : (
          <CircleAlert color={open ? colors.amberStrong : colors.textMuted} size={13} strokeWidth={2.4} />
        )}
        <AppText variant="micro" weight="bold" color={labelColor}>
          {label}
        </AppText>
      </View>

      <AppText
        variant="cardTitle"
        weight="bold"
        color={open ? 'text' : 'textMuted'}
        style={{ writingDirection: contentDirection(snap.title) }}
      >
        {snap.title}
      </AppText>

      {state !== 'rejected' && rows.length > 0 && (
        <View style={{ gap: 6 }}>
          {rows.map((r) => (
            <View key={r.f} style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <AppText variant="small" weight="bold" color="textMuted">
                {t(fieldLabel[r.f])}:
              </AppText>
              {r.from !== null && (
                <>
                  <AppText
                    variant="small"
                    color="textMuted"
                    style={{ textDecorationLine: 'line-through', writingDirection: contentDirection(r.from) }}
                  >
                    {r.from}
                  </AppText>
                  <Arrow color={colors.textMuted} size={13} strokeWidth={2.2} />
                </>
              )}
              <AppText
                variant="small"
                weight="bold"
                color={open ? 'text' : 'textMuted'}
                style={{ flexShrink: 1, writingDirection: contentDirection(r.to) }}
              >
                {r.to}
              </AppText>
            </View>
          ))}
        </View>
      )}

      {open && (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <CardButton label={t('notThis')} onPress={onReject} />
          <CardButton label={t('confirm')} onPress={confirm} busy={working} tone="green" />
        </View>
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

export function CardButton({
  label,
  onPress,
  danger,
  tone,
  busy,
  children,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  /** filled green (Confirm) */
  tone?: 'green';
  busy?: boolean;
  children?: React.ReactNode;
}) {
  const fill = danger ? colors.red : tone === 'green' ? colors.green : null;
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
        borderColor: fill ?? colors.border,
        backgroundColor: fill ?? colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fill ? colors.onDark : colors.textSoft} />
      ) : (
        <>
          {children}
          <AppText variant="small" weight="bold" color={fill ? 'onDark' : 'textSoft'}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}
