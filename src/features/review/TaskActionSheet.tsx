// The two small sheets from the task page's bottom bar (owner, 9 Nov, N2), both in the person's own words:
//   time     ask whoever gave it for a new date (+1 day / +2 days / +1 week) with an optional reason → request_more_time
//   comment  write to the other side (doer ↔ giver) → add_task_comment (an alert to them, listed on the task page)
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AppText, Button } from '@/components/ui';
import { colors, fontFamily, fontSize, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { formatDue } from '@/features/capture/format';
import { REVIEW_BAR_NS } from './barStrings';

const DAY = 86_400_000;
const untyped = supabase as unknown as { rpc: (fn: string, args: object) => Promise<{ data: unknown; error: { message: string } | null }> };

/** n working days (Sun–Thu) after `from`, kept at the same time of day */
function addWorkingDays(from: Date, n: number) {
  const d = new Date(from.getTime());
  let left = n;
  while (left > 0) {
    d.setTime(d.getTime() + DAY);
    const wd = new Date(d.getTime() + 3 * 3_600_000).getUTCDay(); // Riyadh
    if (wd !== 5 && wd !== 6) left--;
  }
  return d;
}

export type SheetMode = 'time' | 'comment';

export function TaskActionSheet({
  mode,
  task,
  toName,
  onClose,
  onDone,
}: {
  mode: SheetMode | null;
  task: { id: string; due_at?: string | null };
  toName: string;
  onClose: () => void;
  onDone: (note: string) => void;
}) {
  const { t } = useScreenT(REVIEW_BAR_NS);
  const { lang, isRTL } = useDirection();
  const qc = useQueryClient();
  const [days, setDays] = useState(2);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = task.due_at && Date.parse(task.due_at) > Date.now() ? new Date(task.due_at) : new Date();
  const newDue = addWorkingDays(base, days);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'time') {
        const { data, error: e } = await untyped.rpc('request_more_time', { p_task: task.id, p_new_due: newDue.toISOString(), p_reason: text.trim() || null });
        if (e) throw new Error(e.message);
        onDone(data === false ? t('alreadyAsked', { name: toName }) : t('askedTime', { name: toName }));
        void qc.invalidateQueries({ queryKey: ['decisions'] });
      } else {
        if (!text.trim()) return;
        const { error: e } = await untyped.rpc('add_task_comment', { p_task: task.id, p_body: text.trim() });
        if (e) throw new Error(e.message);
        onDone(t('commented', { name: toName }));
        void qc.invalidateQueries({ queryKey: ['taskComments', task.id] });
      }
      setText('');
    } catch (e) {
      setError(t('failed', { reason: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const chip = (n: number, label: string) => (
    <Pressable
      key={n}
      onPress={() => setDays(n)}
      accessibilityRole="button"
      accessibilityState={{ selected: days === n }}
      style={{
        minHeight: sizes.touch,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        justifyContent: 'center',
        backgroundColor: days === n ? colors.primary : colors.primaryTint,
      }}
    >
      <AppText weight="bold" color={days === n ? 'onDark' : 'primary'}>
        {label}
      </AppText>
    </Pressable>
  );

  return (
    <Modal visible={!!mode} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} accessibilityLabel={t('keep')} style={{ flex: 1, backgroundColor: 'rgba(11,26,51,0.35)' }} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.cardLg, borderTopRightRadius: radius.cardLg, padding: spacing.xl, gap: spacing.md }}>
          <AppText variant="cardTitle" weight="bold">
            {mode === 'time' ? t('moreTitle') : t('commentTitle', { name: toName })}
          </AppText>
          {mode === 'time' && (
            <>
              <AppText variant="small" color="textMuted">
                {t('moreSub', { name: toName })}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {[chip(1, t('plusDay')), chip(2, t('plus2')), chip(5, t('plusWeek'))]}
              </View>
              <AppText weight="bold" color="primary">
                {t('newDate', { when: formatDue(newDue.toISOString(), lang) })}
              </AppText>
            </>
          )}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={mode === 'time' ? t('reasonPh') : t('commentPh')}
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={2000}
            style={{
              minHeight: 88,
              borderWidth: 1,
              borderColor: colors.borderBlue,
              borderRadius: radius.md,
              padding: spacing.md,
              fontFamily: fontFamily[lang === 'ar' ? 'ar' : lang === 'hi' ? 'hi' : 'en'].regular,
              fontSize: fontSize.body,
              color: colors.text,
              textAlign: isRTL ? 'right' : 'left',
              textAlignVertical: 'top',
            }}
          />
          {!!error && (
            <AppText variant="small" color="red">
              {error}
            </AppText>
          )}
          <Button label={t('sendTo', { name: toName })} onPress={send} loading={busy} disabled={mode === 'comment' && !text.trim()} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
