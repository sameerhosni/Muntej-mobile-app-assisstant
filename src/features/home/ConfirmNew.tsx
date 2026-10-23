// Home: tasks someone gave you that you haven't confirmed yet. Saree3 asks once, here and on the hand-off message:
// Got it · Need more time · Need help. The answer goes to checkin_reply: "Got it" starts the task and nobody else is
// bothered; "more time" becomes a decision for your manager with Saree3's suggestion; "help" tells them what's in the
// way. Hidden when there's nothing to confirm.
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AppText, Button, Card } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { useMyProfile, useTasks, useTeam } from '@/lib/api';
import { formatDue } from '@/features/capture/format';
import { invalidateTaskData } from '@/features/chat/api';
import { Munti } from '@/features/munti/Munti';

const en = {
  title_one: 'A new task for you',
  title_other: '{{count}} new tasks for you',
  from: 'From {{name}}',
  due: 'Due {{when}}',
  gotIt: 'Got it 👍',
  needTime: 'Need time',
  needHelp: 'Need help',
  timePlaceholder: 'How much more, and why? (optional)',
  helpPlaceholder: 'What’s in the way?',
  send: 'Send',
  cancel: 'Back',
  saidGotIt: 'Great, it’s yours. I’ll check in with you, no need to update anyone 😎',
  saidTime: 'I asked {{name}} for more time for you. I’ll tell you the answer.',
  saidHelp: 'I told {{name}}. I’ll come back to you with help.',
  yourManager: 'your manager',
  failed: 'Didn’t go through: {{reason}}',
};
const ar: typeof en & Record<string, string> = {
  title_one: 'جاتك مهمة جديدة',
  title_other: 'جاتك {{count}} مهام جديدة',
  title_two: 'جاتك مهمتين جديدة',
  title_few: 'جاتك {{count}} مهام جديدة',
  title_many: 'جاتك {{count}} مهمة جديدة',
  from: 'من {{name}}',
  due: 'موعدها {{when}}',
  gotIt: 'استلمت 👍',
  needTime: 'أحتاج وقت',
  needHelp: 'أحتاج مساعدة',
  timePlaceholder: 'كم تحتاج زيادة وليش؟ (اختياري)',
  helpPlaceholder: 'وش اللي موقفك؟',
  send: 'أرسل',
  cancel: 'رجوع',
  saidGotIt: 'تمام، صارت عندك. أنا أتابع معك، ولا تحتاج تبلّغ أحد 😎',
  saidTime: 'طلبت لك وقت زيادة من {{name}}، وأرد لك بالجواب.',
  saidHelp: 'بلّغت {{name}}، وأرجع لك بالمساعدة.',
  yourManager: 'مديرك',
  failed: 'ما مشت: {{reason}}',
};
export const CONFIRM_NS = registerStrings('confirmNew', { en, ar });

type Reply = 'got_it' | 'need_time' | 'blocked';

export function ConfirmNew() {
  const { t } = useScreenT(CONFIRM_NS);
  const { lang } = useDirection();
  const me = useMyProfile();
  const tasks = useTasks();
  const team = useTeam();
  const qc = useQueryClient();
  const [asking, setAsking] = useState<{ id: string; reply: Reply } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meId = me.data?.id;
  const isAr = lang === 'ar';
  const people = team.data ?? [];
  const firstOf = (id: string | null | undefined) => {
    const p = people.find((x) => x.id === id);
    return p ? ((isAr && p.full_name_ar) || p.full_name).split(' ')[0] : null;
  };
  const fresh = (tasks.data ?? []).filter(
    (x) => x.owner_id === meId && x.status === 'assigned' && !!x.assigner_id && x.assigner_id !== meId,
  );
  if (!meId || (!fresh.length && !said)) return null;
  const boss = firstOf(me.data?.manager_id) ?? t('yourManager');

  const answer = async (taskId: string, reply: Reply, text?: string) => {
    setBusy(taskId);
    setError(null);
    const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: object) => PromiseLike<{ error: { message: string } | null }>;
    const { error: e } = await rpc('checkin_reply', { p_task: taskId, p_reply: reply, p_note: text?.trim() || null });
    setBusy(null);
    if (e) return setError(t('failed', { reason: e.message }));
    setAsking(null);
    setNote('');
    setSaid(reply === 'got_it' ? t('saidGotIt') : t(reply === 'need_time' ? 'saidTime' : 'saidHelp', { name: boss }));
    invalidateTaskData(qc);
  };

  return (
    <Card padding={spacing.lg} style={{ gap: spacing.md, borderWidth: 1.5, borderColor: colors.primary }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Munti size="sm" mood="talk" />
        <AppText weight="extrabold" style={{ flex: 1, fontSize: 17 }}>
          {fresh.length ? t('title', { count: fresh.length }) : said}
        </AppText>
      </View>
      {!!said && !!fresh.length && (
        <AppText variant="small" color="green" weight="semibold">
          {said}
        </AppText>
      )}
      {fresh.slice(0, 3).map((x) => {
        const open = asking?.id === x.id;
        return (
          <View key={x.id} style={{ gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryTint }}>
            <AppText weight="bold" numberOfLines={2} onPress={() => router.push({ pathname: '/14-task-detail', params: { id: x.id } })}>
              {x.title}
            </AppText>
            <AppText variant="small" color="textSoft" numberOfLines={1}>
              {[firstOf(x.assigner_id) && t('from', { name: firstOf(x.assigner_id) }), x.due_at && t('due', { when: formatDue(x.due_at, lang) })]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
            {open ? (
              <>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder={t(asking.reply === 'need_time' ? 'timePlaceholder' : 'helpPlaceholder')}
                  placeholderTextColor={colors.textFaint}
                  multiline
                  style={{
                    minHeight: 44,
                    borderRadius: radius.md,
                    backgroundColor: colors.surface,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    color: colors.text,
                    textAlign: isAr ? 'right' : 'left',
                  }}
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button label={t('cancel')} variant="ghost" size="md" onPress={() => setAsking(null)} style={{ flex: 1 }} />
                  <Button
                    label={t('send')}
                    size="md"
                    loading={busy === x.id}
                    disabled={asking.reply === 'blocked' && !note.trim()}
                    onPress={() => answer(x.id, asking.reply, note)}
                    style={{ flex: 1 }}
                  />
                </View>
              </>
            ) : (
              <>
                <Button label={t('gotIt')} size="md" loading={busy === x.id} onPress={() => answer(x.id, 'got_it')} />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button label={t('needTime')} variant="outline" size="md" onPress={() => setAsking({ id: x.id, reply: 'need_time' })} style={{ flex: 1 }} />
                  <Button label={t('needHelp')} variant="outline" size="md" onPress={() => setAsking({ id: x.id, reply: 'blocked' })} style={{ flex: 1 }} />
                </View>
              </>
            )}
          </View>
        );
      })}
      {!!error && (
        <AppText variant="small" color="red">
          {error}
        </AppText>
      )}
    </Card>
  );
}
