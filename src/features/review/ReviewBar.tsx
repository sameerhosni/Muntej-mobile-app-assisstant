// The task page's bottom bar. What it offers depends on who you are FOR THIS TASK, not on your job title — a manager
// is also an employee of their own manager:
//   the owner, while working       → Send for review (goes to the assigner / their manager) · or Mark done at the top
//   the owner, while it's in review → "Waiting for X's approval" + the countdown
//   the reviewer, once it's in      → Approve / Send back + the countdown (Muntej approves by itself when it runs out)
//   anyone else                     → only "Change with Muntej"
import { useState } from 'react';
import { intlTag } from '@/lib/i18n/locale';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Clock, MessageSquare, RotateCcw, Send, Sparkles } from 'lucide-react-native';
import { AppText, Button } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import type { Profile, Review } from '@/lib/api';
import { shortName } from '@/features/decisions/people';
import { cancelTask, invalidateTaskData, setTaskStatus } from '@/features/chat/api';
import { TaskActionSheet, type SheetMode } from './TaskActionSheet';
import { autoApproveAt, countdown, leftText, openReview, useNow } from './countdown';
import { REVIEW_BAR_NS } from './barStrings';

const WORKING = ['draft', 'assigned', 'in_progress', 'blocked', 'returned'];

type TaskLike = {
  id: string;
  status: string;
  owner_id: string | null;
  assigner_id: string | null;
  helper_id?: string | null;
  due_at?: string | null;
  /** the giver chose «تنقفل لحالها»: the doer's Done closes it (N3) */
  closes_itself?: boolean | null;
  reviews?: Review[];
};

export function ReviewBar({ task, me, team }: { task: TaskLike; me: Profile | undefined; team: Profile[] }) {
  const { t } = useScreenT(REVIEW_BAR_NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const now = useNow();
  const [busy, setBusy] = useState<'main' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meId = me?.id;
  const person = (id: string | null | undefined) => team.find((p) => p.id === id);
  const nameOf = (id: string | null | undefined) => {
    const p = person(id);
    return p ? shortName(p, lang) : t('yourManager');
  };
  const review = task.status === 'submitted' ? openReview(task.reviews) : null;
  const isOwner = !!meId && task.owner_id === meId;
  const ownerManager = person(task.owner_id)?.manager_id ?? null;
  const reviewerId = review?.reviewer_id ?? (task.assigner_id !== task.owner_id ? task.assigner_id : ownerManager);
  const isReviewer = !isOwner && task.status === 'submitted' && !!meId && (reviewerId === meId || ownerManager === meId);
  // at the top of the tree with your own task: nobody to send it to
  // the giver is below me (or I'm an admin): my Done closes it, nobody below me reviews my work (owner, 9 Nov)
  const giverBelowMe = (() => {
    let cur = person(task.assigner_id)?.manager_id ?? null;
    for (let i = 0; cur && i < 20; i++) {
      if (cur === meId) return true;
      cur = person(cur)?.manager_id ?? null;
    }
    return false;
  })();
  const adminMe = me?.role === 'admin' || me?.role === 'super_admin';
  const closesDirectly =
    isOwner && ((task.assigner_id === meId && !me?.manager_id) || !!task.closes_itself || adminMe || (task.assigner_id !== meId && giverBelowMe));

  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: ['task', task.id] }), qc.invalidateQueries({ queryKey: ['decisions'] }), invalidateTaskData(qc)]);
  const run = async (status: 'done', okText: (result: string) => string) => {
    setBusy('main');
    setError(null);
    try {
      const result = await setTaskStatus(task.id, status);
      setNote(okText(result));
      // saved: the button is free now, the lists catch up behind it
      void refresh();
    } catch (e) {
      setError(t('failed', { reason: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  const change = {
    label: t('changeWithMuntej'),
    onPress: () => router.push({ pathname: '/02-capture', params: { mode: 'text', focus: task.id } }),
    icon: <MessageSquare color={colors.primary} size={18} strokeWidth={2.2} />,
  };

  // the countdown line (only while it waits for a decision)
  const at = autoApproveAt(review);
  const c = at ? countdown(at, now) : null;
  const when = at
    ? new Intl.DateTimeFormat(intlTag(lang, 'ar-SA', 'en-GB'), { timeZone: 'Asia/Riyadh', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(at))
    : '';
  const strip =
    review && (isOwner || isReviewer) ? (
      <View style={{ borderRadius: radius.md, backgroundColor: colors[c?.tint ?? 'primaryTint'], paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, gap: 2 }}>
        <AppText variant="small" weight="bold">
          {isOwner ? t('waitingFor', { name: nameOf(reviewerId) }) : t('waitingForYou', { name: nameOf(task.owner_id) })}
        </AppText>
        {c && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Clock color={colors[c.tone]} size={13} strokeWidth={2.4} />
            <AppText variant="caption" weight="extrabold" color={c.tone} style={{ flexShrink: 1 }}>
              {c.due ? t('autoNow') : `${t('autoIn', { left: leftText(c, t) })} · ${when}`}
            </AppText>
          </View>
        )}
      </View>
    ) : null;

  // the doer's other side (who gave it, or the owner's manager for their own task); the giver's other side is the owner
  const isDoer = !!meId && (task.owner_id === meId || task.helper_id === meId);
  const otherId = isDoer ? (task.assigner_id && task.assigner_id !== meId ? task.assigner_id : ownerManager) : task.owner_id;
  const otherName = nameOf(otherId);
  const open = WORKING.includes(task.status);
  // whoever gave it (or above the owner, or an admin) may close or cancel it (owner, 9 Nov: one Cancel, only the giver)
  const amAdmin = me?.role === 'admin' || me?.role === 'super_admin';
  const isGiver = !isDoer && !!meId && (task.assigner_id === meId || ownerManager === meId || amAdmin);
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [asking, setAsking] = useState(false);

  const small = (label: string, onPress: () => void, icon: React.ReactNode) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        minHeight: sizes.touch,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: 4,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon}
      <AppText variant="small" weight="bold" color="textSoft" numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </AppText>
    </Pressable>
  );
  const muntej = small(t('tellMuntej'), change.onPress, <Sparkles color={colors.purple} size={14} strokeWidth={2.2} />);
  const commentBtn = otherId && otherId !== meId ? small(t('comment'), () => setSheet('comment'), <MessageSquare color={colors.primary} size={14} strokeWidth={2.2} />) : null;

  let buttons: React.ReactNode;
  let extra: React.ReactNode = null;
  if (isReviewer) {
    buttons = (
      <>
        <Button
          label={t('approve')}
          onPress={() => run('done', () => t('approved'))}
          loading={busy === 'main'}
          icon={<Check color={colors.onDark} size={18} strokeWidth={2.4} />}
          style={{ flex: 1 }}
        />
        <Button
          label={t('sendBack')}
          variant="outline"
          onPress={() => router.push({ pathname: '/15-review', params: { id: task.id } })}
          disabled={!!busy}
          icon={<RotateCcw color={colors.primary} size={16} strokeWidth={2.2} />}
          style={{ minWidth: 120 }}
        />
      </>
    );
  } else if (isOwner && open) {
    // the doer (owner, 9 Nov, N2): always here, not only after every step is ticked
    buttons = (
      <Button
        label={closesDirectly ? t('doneClose') : t('doneSend', { name: otherName })}
        onPress={() => run('done', (r) => (r === 'submitted' ? t('sent') : t('closed')))}
        loading={busy === 'main'}
        icon={closesDirectly ? <Check color={colors.onDark} size={18} strokeWidth={2.4} /> : <Send color={colors.onDark} size={18} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />}
        style={{ flex: 1 }}
      />
    );
    extra = [otherId && otherId !== meId ? small(t('moreTime'), () => setSheet('time'), <Clock color={colors.amberText} size={14} strokeWidth={2.2} />) : null, commentBtn, muntej];
  } else if (isGiver && open) {
    buttons = asking ? (
      <View style={{ flex: 1, gap: spacing.sm, backgroundColor: colors.redTint, borderRadius: radius.md, padding: spacing.md }}>
        <AppText variant="small" weight="bold" color="red">
          {t('cancelAsk')}
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label={t('keep')} variant="outline" size="md" onPress={() => setAsking(false)} style={{ flex: 1 }} />
          <Button
            label={t('yesCancel')}
            size="md"
            loading={busy === 'main'}
            onPress={async () => {
              setBusy('main');
              setError(null);
              try {
                await cancelTask(task.id);
                setAsking(false);
                setNote(t('cancelledOk'));
                void refresh();
              } catch (e) {
                setError(t('failed', { reason: (e as Error).message }));
              } finally {
                setBusy(null);
              }
            }}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    ) : (
      <Button
        label={t('closeIt')}
        onPress={() => run('done', () => t('closed'))}
        loading={busy === 'main'}
        icon={<Check color={colors.onDark} size={18} strokeWidth={2.4} />}
        style={{ flex: 1 }}
      />
    );
    if (!asking) extra = [commentBtn, small(t('cancelIt'), () => setAsking(true), <Ban color={colors.textSoft} size={14} strokeWidth={2.2} />), muntej];
  } else {
    buttons = <Button label={t('tellMuntej')} onPress={change.onPress} icon={<Sparkles color={colors.purple} size={18} strokeWidth={2.2} />} variant="outline" style={{ flex: 1 }} />;
    if (isDoer && commentBtn) extra = [commentBtn];
  }

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: spacing.screen,
        paddingTop: spacing.lg,
        paddingBottom: Math.max(insets.bottom, spacing.xxl) + 14,
        backgroundColor: colors.bg,
        gap: spacing.sm,
      }}
    >
      {strip}
      {(note || error) && (
        <AppText variant="small" weight="bold" color={error ? 'red' : 'greenText'} align="center">
          {error ?? note}
        </AppText>
      )}
      <View style={{ flexDirection: 'row', gap: spacing.md }}>{buttons}</View>
      {!!extra && <View style={{ flexDirection: 'row', gap: 6 }}>{extra}</View>}
      <TaskActionSheet
        mode={sheet}
        task={task}
        toName={otherName}
        onClose={() => setSheet(null)}
        onDone={(n) => {
          setSheet(null);
          setNote(n);
        }}
      />
    </View>
  );
}

/** "Auto in 1d 6h" for lists (Home "Needs you" review rows) */
export function AutoApproveTag({ at }: { at: string | null | undefined }) {
  const { t } = useScreenT(REVIEW_BAR_NS);
  const now = useNow();
  if (!at) return null;
  const c = countdown(at, now);
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors[c.tint] }}>
      <Clock color={colors[c.tone]} size={11} strokeWidth={2.4} />
      <AppText variant="micro" weight="extrabold" color={c.tone}>
        {c.due ? t('autoNow') : t('autoShort', { left: leftText(c, t) })}
      </AppText>
    </View>
  );
}
