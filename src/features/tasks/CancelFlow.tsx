// Cancel a task with one tap (owner, 10 Nov, option 1 + «رجّعها» from option 2): ✕ → «تلغيها؟» → «إيه، ألغها» → the task
// leaves the lists and its follow-ups stop, and «انلغت ✓ · رجّعها» stays for 6 seconds to bring it straight back. Later
// it comes back from ⋯ → Cancelled → the task → «رجّعها». Nothing is ever deleted for good.
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { AppText, Button } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { cancelTask, invalidateTaskData, restoreTask } from '@/features/chat/api';

const en = {
  ask: 'Cancel it?',
  askBody: 'It leaves your lists and Muntej stops following up.',
  yes: 'Yes, cancel it',
  no: 'No',
  done: 'Cancelled ✓ «{{title}}»',
  undo: 'Bring it back',
  back: 'It’s back ✓',
  failed: 'Couldn’t do it: {{why}}',
  notYours: 'only whoever gave it (or their manager) can decide',
  alreadyDone: 'it’s already done',
  tryAgain: 'try again in a moment',
  a11y: 'Cancel «{{title}}»',
};
const ar: typeof en = {
  ask: 'تلغيها؟',
  askBody: 'تختفي من القوائم وتوقف المتابعة.',
  yes: 'إيه، ألغها',
  no: 'لا',
  done: 'انلغت ✓ «{{title}}»',
  undo: 'رجّعها',
  back: 'رجعت ✓',
  failed: 'ما قدرت: {{why}}',
  notYours: 'القرار فيها لللي عطاها أو مديره',
  alreadyDone: 'خلصت أصلاً',
  tryAgain: 'جرّب بعد شوي',
  a11y: 'ألغِ «{{title}}»',
};
export const CANCEL_NS = registerStrings('cancelFlow', { en, ar });

export const UNDO_MS = 6000;
type Item = { id: string; title: string };

/** the quick ✕ on list rows and «اطلب إلغاءها»: testers first (feature quick_cancel); Cancel on the page and «رجّعها» never wait */
export function useQuickCancelOn() {
  return (
    useQuery({
      queryKey: ['featureOn', 'quick_cancel'],
      queryFn: async () => (await supabase.rpc('feature_on' as never, { p_key: 'quick_cancel' } as never)).data === true,
      staleTime: 5 * 60_000,
    }).data === true
  );
}

/** the confirm sheet and the 6-second «رجّعها» line; `ask(task)` starts it. `onChange` runs after a cancel or a bring-back. */
export function useCancelFlow(onChange?: (what: 'cancelled' | 'restored', task: Item) => void) {
  const { t } = useScreenT(CANCEL_NS);
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [asking, setAsking] = useState<Item | null>(null);
  const [toast, setToast] = useState<{ item: Item; text: string; undo: boolean; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // never the server's raw text (R7): its known refusal in plain words, anything else "try again"; the real one is logged
  const reason = (e: unknown) => {
    const m = e instanceof Error ? e.message : String(e);
    return /Only the person/.test(m) ? t('notYours') : /Already done/.test(m) ? t('alreadyDone') : t('tryAgain');
  };
  const show = (next: typeof toast, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(next);
    timer.current = setTimeout(() => setToast(null), ms);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const confirm = async () => {
    if (asking) await cancelNow(asking);
  };
  /** cancel without the sheet (a row that already asked, like «يحتاجك»), with the same 6-second «رجّعها»; true when it worked */
  const cancelNow = async (item: Item): Promise<boolean> => {
    setBusy(true);
    try {
      await cancelTask(item.id);
      setAsking(null);
      show({ item, text: t('done', { title: item.title.slice(0, 40) }), undo: true }, UNDO_MS);
      onChange?.('cancelled', item);
      void invalidateTaskData(qc);
      void qc.invalidateQueries({ queryKey: ['task', item.id] });
      void qc.invalidateQueries({ queryKey: ['needsYouAsks'] });
      return true;
    } catch (e) {
      console.error('cancel_task failed:', e instanceof Error ? e.message : String(e));
      setAsking(null);
      show({ item, text: t('failed', { why: reason(e) }), undo: false, error: true }, UNDO_MS);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!toast) return;
    const item = toast.item;
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
    try {
      await restoreTask(item.id);
      show({ item, text: t('back'), undo: false }, 2500);
      onChange?.('restored', item);
      void invalidateTaskData(qc);
      void qc.invalidateQueries({ queryKey: ['task', item.id] });
    } catch (e) {
      console.error('restore_task failed:', e instanceof Error ? e.message : String(e));
      show({ item, text: t('failed', { why: reason(e) }), undo: false, error: true }, UNDO_MS);
    }
  };

  const ui = (
    <>
      <Modal visible={!!asking} transparent animationType="fade" onRequestClose={() => setAsking(null)}>
        <Pressable onPress={() => setAsking(null)} accessibilityLabel={t('no')} style={{ flex: 1, backgroundColor: 'rgba(11,27,63,0.35)', justifyContent: 'flex-end' }}>
          <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.screen, paddingBottom: insets.bottom + spacing.xl, gap: spacing.sm }}>
            <AppText variant="cardTitle" weight="bold">
              {t('ask')}
            </AppText>
            {!!asking && (
              <AppText weight="semibold" numberOfLines={2}>
                {asking.title}
              </AppText>
            )}
            <AppText variant="small" color="textMuted">
              {t('askBody')}
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Button label={t('yes')} onPress={confirm} loading={busy} style={{ flex: 1 }} />
              <Button label={t('no')} variant="outline" onPress={() => setAsking(null)} disabled={busy} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {!!toast && (
        <View
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            left: spacing.screen,
            right: spacing.screen,
            bottom: insets.bottom + spacing.lg,
            minHeight: sizes.touch + 8,
            borderRadius: radius.md,
            backgroundColor: toast.error ? colors.red : colors.navy,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
            gap: spacing.sm,
          }}
        >
          <AppText variant="small" weight="bold" color="onDark" numberOfLines={2} style={{ flex: 1 }}>
            {toast.text}
          </AppText>
          {toast.undo && (
            <Pressable onPress={undo} accessibilityRole="button" hitSlop={8} style={{ minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: spacing.sm }}>
              <AppText weight="extrabold" color="onDark" style={{ textDecorationLine: 'underline' }}>
                {t('undo')}
              </AppText>
            </Pressable>
          )}
        </View>
      )}
    </>
  );

  return { ask: (task: Item) => setAsking(task), cancelNow, ui, reason, cancelA11y: (title: string) => t('a11y', { title }) };
}
