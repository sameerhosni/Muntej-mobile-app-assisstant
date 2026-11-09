// Who a task is from and who it's for (owner, 8 Nov: "make it clear from where task came and to whom assigned... and
// make it easy to change"; he picked option A of design/examples/task-from-to.png):
//   FromToRow   the task page: two boxes «من …» ← «إلى …» with photos; "To" opens a list of people to move it to
//   fromToLine  the Tasks list: "من فيصل ← إلى نورة" (or "إلى …" alone for your own task)
// Moving it goes through bulk_update_tasks (the same rules, notice and 5-minute Undo as the chat's bulk changes).
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Pencil } from 'lucide-react-native';
import { AppText, Avatar } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/api';
import { invalidateTaskData } from '@/features/chat/api';
import { useAssignable } from './assignable';

const en = {
  from: 'From',
  to: 'To',
  you: 'You',
  nobody: 'Nobody yet',
  srcEmail: 'Email',
  fromTo: 'From {{from}} → to {{to}}',
  toOnly: 'To {{to}}',
  change: 'Change who does it',
  pickWho: 'Who should do it?',
  moved: 'Moved to {{name}}. They’re told.',
  undo: 'Undo',
  failed: 'Couldn’t move it: {{why}}',
  close: 'Close',
};
const ar: typeof en = {
  from: 'من',
  to: 'إلى',
  you: 'أنت',
  nobody: 'لسه ما أحد',
  srcEmail: 'إيميل',
  fromTo: 'من {{from}} ← إلى {{to}}',
  toOnly: 'إلى {{to}}',
  change: 'غيّر مين يسويها',
  pickWho: 'مين يسويها؟',
  moved: 'صارت عند {{name}}، وبلّغته.',
  undo: 'تراجع',
  failed: 'ما قدرت أنقلها: {{why}}',
  close: 'سكّر',
};
export const FROM_TO_NS = registerStrings('fromTo', { en, ar });

type Person = Pick<Profile, 'id' | 'full_name' | 'full_name_ar'> & { manager_id?: string | null; status?: string; role?: string };
type T = (k: string, o?: Record<string, unknown>) => string;

const nameOf = (p: Person | undefined, lang: string) => (p ? (lang === 'ar' && p.full_name_ar) || p.full_name : null);
const firstOf = (p: Person | undefined, lang: string) => nameOf(p, lang)?.split(' ')[0] ?? null;

/** "من فيصل ← إلى نورة" for a task row; null when there's nothing to say (no owner and nobody gave it) */
export function fromToLine(
  t: T,
  task: { owner_id: string | null; assigner_id: string | null },
  team: Person[],
  meId: string | undefined,
  lang: string,
): string | null {
  const who = (id: string | null) => (id && id === meId ? t('you') : firstOf(team.find((p) => p.id === id), lang));
  const to = task.owner_id ? who(task.owner_id) : t('nobody');
  if (!to) return null;
  const from = task.assigner_id && task.assigner_id !== task.owner_id ? who(task.assigner_id) : null;
  return from ? t('fromTo', { from, to }) : t('toOnly', { to });
}

/** may I move this task? whoever gave it, the owner's manager, or an admin (the server checks again) */
const canMove = (task: { owner_id: string | null; assigner_id: string | null }, me: Person | undefined, team: Person[]) =>
  !!me &&
  (task.assigner_id === me.id ||
    me.role === 'admin' ||
    me.role === 'super_admin' ||
    (!!task.owner_id && team.find((p) => p.id === task.owner_id)?.manager_id === me.id));

export function FromToRow({
  task,
  me,
  team,
}: {
  task: { id: string; owner_id: string | null; assigner_id: string | null; external_from?: string | null; source?: string | null };
  me: Person | undefined;
  team: Person[];
}) {
  const { t } = useScreenT(FROM_TO_NS);
  const { lang, isRTL } = useDirection();
  const qc = useQueryClient();
  const mayGive = useAssignable();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<{ text: string; undo?: string; error?: boolean } | null>(null);
  const owner = team.find((p) => p.id === task.owner_id);
  const giver = task.assigner_id && task.assigner_id !== task.owner_id ? team.find((p) => p.id === task.assigner_id) : undefined;
  const label = (p: Person | undefined, id: string | null) => (id && id === me?.id ? t('you') : (nameOf(p, lang) ?? t('nobody')));
  // nobody in Muntej gave it: who sent it in the tool, else the tool, else you made it yourself (owner, 9 Nov: "why many
  // tasks with no assignee, from where you get it")
  const TOOL_NAMES: Record<string, string> = { email: t('srcEmail'), google_chat: 'Google Chat', teams: 'Teams', slack: 'Slack', whatsapp: 'WhatsApp', jira: 'Jira' };
  const tool = task.source ? TOOL_NAMES[task.source] : undefined;
  const outside = task.external_from ? (tool ? `${task.external_from} · ${tool}` : task.external_from) : tool;
  const fromLabel = (p: Person | undefined, id: string | null) => (id ? label(p, id) : (outside ?? (task.assigner_id ? t('you') : t('nobody'))));
  const movable = canMove(task, me, team);
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  const move = async (p: Person) => {
    setOpen(false);
    setNote(null);
    const rpc = supabase.rpc as unknown as (fn: string, a: object) => Promise<{ data: { failed?: { error: string }[]; log_id?: string } | null; error: { message: string } | null }>;
    const { data, error } = await rpc('bulk_update_tasks', { p_ids: [task.id], p_change: { kind: 'owner', owner_id: p.id } });
    const why = error?.message ?? data?.failed?.[0]?.error;
    if (why) return setNote({ text: t('failed', { why }), error: true });
    setNote({ text: t('moved', { name: firstOf(p, lang) }), undo: data?.log_id });
    await invalidateTaskData(qc);
  };
  const undo = async (logId: string) => {
    setNote(null);
    await (supabase.rpc as unknown as (fn: string, a: object) => Promise<unknown>)('undo_task_changes', { p_log: logId });
    await invalidateTaskData(qc);
  };

  const box = (kind: 'from' | 'to', p: Person | undefined, id: string | null) => (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: kind === 'to' ? colors.primaryTint : colors.surfaceMuted,
      }}
    >
      <Avatar name={kind === 'from' ? fromLabel(p, id) : label(p, id)} size={32} gradient={kind === 'to' ? 'avatarBlue' : undefined} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="micro" color={kind === 'to' ? 'primary' : 'textMuted'}>
          {t(kind)}
        </AppText>
        <AppText weight="bold" numberOfLines={2} color={kind === 'to' ? 'navy' : 'text'}>
          {kind === 'from' ? fromLabel(p, id) : label(p, id)}
        </AppText>
      </View>
      {kind === 'to' && movable && <Pencil color={colors.primary} size={16} strokeWidth={2.2} />}
    </View>
  );

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {giver || task.assigner_id ? box('from', giver, task.assigner_id && task.assigner_id !== task.owner_id ? task.assigner_id : null) : null}
        {(giver || task.assigner_id) && <Arrow color={colors.textMuted} size={18} strokeWidth={2} />}
        <Pressable
          onPress={() => movable && setOpen(true)}
          disabled={!movable}
          accessibilityRole="button"
          accessibilityLabel={`${t('to')} ${label(owner, task.owner_id)}${movable ? `. ${t('change')}` : ''}`}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.85 : 1 })}
        >
          {box('to', owner, task.owner_id)}
        </Pressable>
      </View>
      {!!note && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="small" weight="bold" color={note.error ? 'red' : 'greenText'} style={{ flex: 1 }}>
            {note.text}
          </AppText>
          {!!note.undo && (
            <Pressable onPress={() => undo(note.undo!)} accessibilityRole="button" hitSlop={8} style={{ minHeight: sizes.touch, justifyContent: 'center' }}>
              <AppText variant="small" weight="bold" color="primary">
                {t('undo')}
              </AppText>
            </Pressable>
          )}
        </View>
      )}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} accessibilityLabel={t('close')} style={{ flex: 1, backgroundColor: 'rgba(11,27,63,0.35)', justifyContent: 'flex-end' }}>
          <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.screen, gap: spacing.sm, maxHeight: '70%' }}>
            <AppText variant="cardTitle" weight="bold">
              {t('pickWho')}
            </AppText>
            <ScrollView>
              {team
                .filter((p) => p.id !== task.owner_id && p.status !== 'deleted' && mayGive(p.id))
                .map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => move(p)}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      minHeight: sizes.touch + 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      paddingVertical: spacing.xs,
                      backgroundColor: pressed ? colors.primaryTint : 'transparent',
                      borderRadius: radius.md,
                    })}
                  >
                    <Avatar name={nameOf(p, lang) ?? ''} size={34} />
                    <AppText weight="bold" style={{ flex: 1 }}>
                      {p.id === me?.id ? `${nameOf(p, lang)} (${t('you')})` : nameOf(p, lang)}
                    </AppText>
                  </Pressable>
                ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** the same two boxes for a task Muntej found in a message, before it's added (owner, 8 Nov: "Here also should be from
 *  and to option"): who asked → who it's for; "To" picks someone from the team */
export function FoundFromTo({
  from,
  toId,
  toName,
  team,
  meId,
  onPick,
}: {
  from: string | null;
  toId: string | null;
  /** someone the message names who isn't in the team */
  toName?: string | null;
  team: Person[];
  meId: string | undefined;
  onPick: (id: string) => void;
}) {
  const { t } = useScreenT(FROM_TO_NS);
  const { lang, isRTL } = useDirection();
  const mayGive = useAssignable();
  const [open, setOpen] = useState(false);
  const owner = team.find((p) => p.id === toId);
  const to = toId && toId === meId ? t('you') : (nameOf(owner, lang) ?? toName ?? t('nobody'));
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const box = (kind: 'from' | 'to', name: string) => (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: kind === 'to' ? colors.primaryTint : colors.surfaceMuted,
      }}
    >
      <Avatar name={name} size={28} gradient={kind === 'to' ? 'avatarBlue' : undefined} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="micro" color={kind === 'to' ? 'primary' : 'textMuted'}>
          {t(kind)}
        </AppText>
        <AppText variant="small" weight="bold" numberOfLines={2} color={kind === 'to' ? 'navy' : 'text'}>
          {name}
        </AppText>
      </View>
      {kind === 'to' && <Pencil color={colors.primary} size={14} strokeWidth={2.2} />}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      {!!from && box('from', from)}
      {!!from && <Arrow color={colors.textMuted} size={16} strokeWidth={2} />}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t('to')} ${to}. ${t('change')}`}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.85 : 1 })}
      >
        {box('to', to)}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} accessibilityLabel={t('close')} style={{ flex: 1, backgroundColor: 'rgba(11,27,63,0.35)', justifyContent: 'flex-end' }}>
          <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.screen, gap: spacing.sm, maxHeight: '70%' }}>
            <AppText variant="cardTitle" weight="bold">
              {t('pickWho')}
            </AppText>
            <ScrollView>
              {team
                .filter((p) => p.id !== toId && p.status !== 'deleted' && mayGive(p.id))
                .map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setOpen(false);
                      onPick(p.id);
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      minHeight: sizes.touch + 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      paddingVertical: spacing.xs,
                      backgroundColor: pressed ? colors.primaryTint : 'transparent',
                      borderRadius: radius.md,
                    })}
                  >
                    <Avatar name={nameOf(p, lang) ?? ''} size={34} />
                    <AppText weight="bold" style={{ flex: 1 }}>
                      {p.id === meId ? `${nameOf(p, lang)} (${t('you')})` : nameOf(p, lang)}
                    </AppText>
                  </Pressable>
                ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
