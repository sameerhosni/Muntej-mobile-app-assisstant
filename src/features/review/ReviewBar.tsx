// The task page's bottom bar. What it offers depends on who you are FOR THIS TASK, not on your job title — a manager
// is also an employee of their own manager:
//   the owner, while working       → Send for review (goes to the assigner / their manager) · or Mark done at the top
//   the owner, while it's in review → "Waiting for X's approval" + the countdown
//   the reviewer, once it's in      → Approve / Send back + the countdown (Muntej approves by itself when it runs out)
//   anyone else                     → only "Change with Muntej"
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Clock, MessageSquare, RotateCcw, Send } from 'lucide-react-native';
import { AppText, Button } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import type { Profile, Review } from '@/lib/api';
import { shortName } from '@/features/decisions/people';
import { invalidateTaskData, setTaskStatus } from '@/features/chat/api';
import { autoApproveAt, countdown, leftText, openReview, useNow } from './countdown';
import { REVIEW_BAR_NS } from './barStrings';

const WORKING = ['draft', 'assigned', 'in_progress', 'blocked', 'returned'];

type TaskLike = { id: string; status: string; owner_id: string | null; assigner_id: string | null; reviews?: Review[] };

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
  const closesDirectly = isOwner && task.assigner_id === meId && !me?.manager_id;

  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: ['task', task.id] }), qc.invalidateQueries({ queryKey: ['decisions'] }), invalidateTaskData(qc)]);
  const run = async (status: 'done', okText: (result: string) => string) => {
    setBusy('main');
    setError(null);
    try {
      const result = await setTaskStatus(task.id, status);
      setNote(okText(result));
      await refresh();
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
    ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(at))
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

  let buttons: React.ReactNode;
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
  } else if (isOwner && WORKING.includes(task.status)) {
    buttons = (
      <>
        <Button
          label={closesDirectly ? t('markDone') : t('sendForReview')}
          onPress={() => run('done', (r) => (r === 'submitted' ? t('sent') : t('closed')))}
          loading={busy === 'main'}
          icon={closesDirectly ? <Check color={colors.onDark} size={18} strokeWidth={2.4} /> : <Send color={colors.onDark} size={18} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />}
          style={{ flex: 1 }}
        />
        <Button {...change} variant="outline" style={{ minWidth: 96 }} />
      </>
    );
  } else {
    buttons = <Button {...change} variant="outline" style={{ flex: 1 }} />;
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
