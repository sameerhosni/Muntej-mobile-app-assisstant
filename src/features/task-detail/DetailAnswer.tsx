// Task page · the details and the doer's question (owner, 10 Nov, option 2 of the mockup): the definition of done, the due
// date, the budget and the description as lines under the title (they were only ✓ in the clarity ring), and for whoever
// gave the task a «❓ X يسأل عن … · جاوب» bar that opens a sheet to answer right here. Saved by answer-detail →
// answer_task_detail: the task changes, the question leaves "Needs you", the asker is told.
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText, Button, Card, TextField } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { intlTag } from '@/lib/i18n/locale';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';

export type What = 'due' | 'doneDef' | 'budget';
type Person = { id: string; full_name: string; full_name_ar?: string | null };
type Task = { id: string; due_at: string | null; definition_of_done: string | null; budget: string | null; description: string | null; assigner_id: string | null };

const en = {
  details: 'Details',
  doneDef: 'Done when',
  due: 'Due',
  budget: 'Budget',
  description: 'Description',
  missing: 'Missing',
  none: 'None',
  asks_due: '❓ {{name}} asks for the due date',
  asks_doneDef: '❓ {{name}} asks what counts as done',
  asks_budget: '❓ {{name}} asks about the budget',
  answer: 'Answer',
  edit: 'Edit',
  q_due: '⏰ When is it due?',
  q_doneDef: '✅ When does it count as done?',
  q_budget: '💰 What is the budget?',
  ph_due: 'In your own words (tomorrow, Thursday at 3…)',
  ph_text: 'Write it here',
  tomorrow: 'Tomorrow',
  in3: 'In 3 days',
  sunday: 'Next Sunday',
  week: 'In a week',
  save: 'Save and tell them',
  later: 'Later',
  noBudget: 'No budget',
  unclear: 'I didn’t get the date. Pick one, or write it another way.',
  failed: 'Couldn’t save it. Try again.',
  someone: 'They',
};
const ar: typeof en = {
  details: 'التفاصيل',
  doneDef: 'تعريف الإنجاز',
  due: 'الموعد',
  budget: 'الميزانية',
  description: 'الوصف',
  missing: 'ناقص',
  none: 'ما فيه',
  asks_due: '❓ {{name}} يسأل عن الموعد',
  asks_doneDef: '❓ {{name}} يسأل عن تعريف الإنجاز',
  asks_budget: '❓ {{name}} يسأل عن الميزانية',
  answer: 'جاوب',
  edit: 'تعديل',
  q_due: '⏰ متى الموعد؟',
  q_doneDef: '✅ متى تعتبر خالصة؟',
  q_budget: '💰 كم الميزانية؟',
  ph_due: 'اكتبه بكلامك (بكرة، الخميس الساعة 3…)',
  ph_text: 'اكتبه هنا',
  tomorrow: 'بكرة',
  in3: 'بعد 3 أيام',
  sunday: 'الأحد الجاي',
  week: 'بعد أسبوع',
  save: 'حفظ وبلّغه',
  later: 'لاحقاً',
  noBudget: 'ما فيه ميزانية',
  unclear: 'ما فهمت التاريخ. اختر واحد، أو اكتبه بطريقة ثانية.',
  failed: 'ما قدرت أحفظها. جرّب مرة ثانية.',
  someone: 'أحد',
};
const NS = registerStrings('detailAnswer', { en, ar });

/** quick dates at 17:00 Riyadh, weekend skipped, never two on the same day (the server's quickDates, same rule) */
function quickDates(now = new Date()): { key: 'tomorrow' | 'in3' | 'sunday' | 'week'; at: string }[] {
  const R = 3 * 3_600_000;
  const dayStart = (d: Date) => {
    const r = new Date(d.getTime() + R);
    return Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate()) - R;
  };
  const at = (days: number) => {
    let t = dayStart(now) + days * 86_400_000;
    for (let i = 0; i < 2; i++) {
      const wd = new Date(t + R).getUTCDay();
      if (wd === 5 || wd === 6) t += 86_400_000;
    }
    return new Date(t + 17 * 3_600_000).toISOString();
  };
  const wd = new Date(now.getTime() + R).getUTCDay();
  const all = [
    { key: 'tomorrow' as const, at: at(1) },
    { key: 'in3' as const, at: at(3) },
    { key: 'sunday' as const, at: at(((7 - wd) % 7) || 7) },
    { key: 'week' as const, at: at(7) },
  ];
  const seen = new Set<string>();
  return all.filter((d) => !seen.has(d.at) && (seen.add(d.at), true)).slice(0, 3);
}

/** answering on the task page is on for this person (testers first: feature task_answers) */
export function useAnswersOn() {
  return (
    useQuery({
      queryKey: ['featureOn', 'task_answers'],
      queryFn: async () => (await supabase.rpc('feature_on' as never, { p_key: 'task_answers' } as never)).data === true,
    }).data === true
  );
}

export function DetailAnswer({ task, meId, team, sheet, setSheet, isAdmin = false }: { task: Task; meId: string | undefined; team: Person[]; sheet: What | null; setSheet: (w: What | null) => void; isAdmin?: boolean }) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // who may answer / edit: whoever gave it, or an admin (answer_task_detail's own rule — reviewer, 10 Nov)
  // the question bar and the answer sheet: testers first, like «جاوب» on WhatsApp (feature task_answers, R69)
  const answersOn = useAnswersOn();
  const giver = answersOn && !!meId && (task.assigner_id === meId || isAdmin);

  // the open question(s) about this task, for the giver (alerts.detail_asked, unread)
  const asks = useQuery({
    queryKey: ['detailAsks', task.id, meId],
    enabled: giver,
    queryFn: async () => {
      const { data } = await supabase
        .from('alerts')
        .select('id, subject_id, dedupe_key, created_at')
        .eq('profile_id', meId!)
        .eq('kind', 'detail_asked')
        .eq('task_id', task.id)
        .is('read_at', null)
        .order('created_at', { ascending: false });
      return (data ?? []) as { id: string; subject_id: string | null; dedupe_key: string | null }[];
    },
  });
  const open = (asks.data ?? [])
    .map((a) => ({ ...a, what: /^ask:[0-9a-f-]+:(due|doneDef|budget):/.exec(a.dedupe_key ?? '')?.[1] as What | undefined }))
    .filter((a): a is typeof a & { what: What } => !!a.what);
  const first = open[0];
  const nameOf = (id: string | null) => {
    const p = id ? team.find((x) => x.id === id) : undefined;
    return p ? ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0] : t('someone');
  };
  const when = (iso: string) =>
    new Intl.DateTimeFormat(intlTag(lang, 'ar-SA-u-nu-latn-ca-gregory', 'en-GB'), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(iso));

  const lines: { key: What | 'description'; value: string | null }[] = [
    { key: 'doneDef', value: task.definition_of_done },
    { key: 'due', value: task.due_at ? when(task.due_at) : null },
    ...(task.budget ? [{ key: 'budget' as const, value: task.budget }] : []),
    ...(task.description ? [{ key: 'description' as const, value: task.description }] : []),
  ];

  const close = () => {
    setSheet(null);
    setText('');
    setNote(null);
  };
  const save = async (v: { text?: string; due?: string; none?: boolean }) => {
    if (!sheet) return;
    setBusy(true);
    setNote(null);
    const { data, error } = await supabase.functions.invoke('answer-detail', { body: { task_id: task.id, what: sheet, ...v } });
    setBusy(false);
    if (error) return setNote(t('failed'));
    if ((data as { unclear?: boolean })?.unclear) return setNote(t('unclear'));
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['detailAsks', task.id] }),
      qc.invalidateQueries({ queryKey: ['task', task.id] }),
      qc.invalidateQueries({ queryKey: ['tasks'] }),
      qc.invalidateQueries({ queryKey: ['alerts'] }),
    ]);
    close();
  };

  return (
    <View style={{ gap: spacing.md }}>
      {giver && first && (
        <Card padding={spacing.lg} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.amberTint }}>
          <AppText weight="bold" color="amberText" style={{ flex: 1 }}>
            {t(`asks_${first.what}`, { name: nameOf(first.subject_id) })}
          </AppText>
          <Pressable
            onPress={() => setSheet(first.what)}
            accessibilityRole="button"
            style={({ pressed }) => ({ minHeight: sizes.touch, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
          >
            <AppText weight="bold" color="onDark">
              {t('answer')}
            </AppText>
          </Pressable>
        </Card>
      )}

      <Card padding={spacing.lg} style={{ gap: 2 }}>
        <AppText weight="extrabold" style={{ marginBottom: spacing.xs }}>
          {t('details')}
        </AppText>
        {lines.map((l, i) => (
          <Pressable
            key={l.key}
            disabled={!giver || l.key === 'description'}
            onPress={() => l.key !== 'description' && setSheet(l.key)}
            accessibilityRole={giver && l.key !== 'description' ? 'button' : undefined}
            style={{ flexDirection: 'row', gap: spacing.md, minHeight: sizes.touch, paddingVertical: spacing.sm, alignItems: 'flex-start', borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}
          >
            <AppText color="textMuted" style={{ width: 96 }}>
              {t(l.key)}
            </AppText>
            <AppText style={{ flex: 1 }} color={l.value ? 'text' : 'amberText'} weight={l.value ? 'regular' : 'bold'}>
              {l.value ?? t('missing')}
            </AppText>
            {giver && l.key !== 'description' && (
              <AppText variant="caption" weight="bold" color="primary">
                {t('edit')}
              </AppText>
            )}
          </Pressable>
        ))}
      </Card>

      <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={close}>
        {/* the keyboard pushes the sheet up, never covers the box and «حفظ» (R65: padding on Android too) */}
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(11,26,51,0.35)' }} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.cardLg, borderTopRightRadius: radius.cardLg, padding: spacing.screen, gap: spacing.md }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          {sheet && (
            <AppText weight="extrabold" style={{ fontSize: 17 }}>
              {t(`q_${sheet}`)}
            </AppText>
          )}
          <TextField value={text} onChangeText={setText} placeholder={sheet === 'due' ? t('ph_due') : t('ph_text')} multiline={sheet === 'doneDef'} />
          {sheet === 'due' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {quickDates().map((q) => (
                <Pressable
                  key={q.key}
                  onPress={() => save({ due: q.at })}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ minHeight: sizes.touch, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: colors.primaryTint, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
                >
                  <AppText weight="bold" color="primary">
                    {t(q.key)}
                  </AppText>
                </Pressable>
              ))}
            </View>
          )}
          {sheet === 'budget' && (
            <Pressable onPress={() => save({ none: true })} accessibilityRole="button" style={{ minHeight: sizes.touch, justifyContent: 'center' }}>
              <AppText weight="bold" color="primary">
                {t('noBudget')}
              </AppText>
            </Pressable>
          )}
          {note && (
            <AppText color="amberText" weight="semibold">
              {note}
            </AppText>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button label={t('save')} loading={busy} disabled={!text.trim()} onPress={() => save({ text })} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t('later')} variant="outline" onPress={close} />
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
