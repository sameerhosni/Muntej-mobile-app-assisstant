import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { AppText, Button, IconButton } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import type { Profile } from '@/lib/api';
import { EditTask } from '@/features/capture/EditTask';
import type { ParsedTask } from '@/features/capture/api';
import type { CardTask, TaskPatch } from './api';
import { NS } from './strings';

const FIELDS = ['title', 'owner_id', 'helper_id', 'due_at', 'priority', 'definition_of_done', 'budget', 'goal'] as const;

/** EditTask edits a ParsedTask draft; build one from the card. */
export function draftFromCard(task: CardTask, lang: 'en' | 'ar'): ParsedTask {
  return {
    language: lang,
    transcript: '',
    title: task.title,
    owner_id: task.owner_id,
    helper_id: task.helper_id,
    helper_reason: null,
    due_at: task.due_at,
    priority: task.priority,
    goal: task.goal,
    definition_of_done: task.definition_of_done,
    budget: task.budget,
    workspace_id: null,
    missing: task.missing,
    followup_plan: [],
  };
}

/** Only the fields the user actually changed. */
function diff(before: ParsedTask, after: ParsedTask): TaskPatch {
  const patch: Record<string, unknown> = {};
  for (const f of FIELDS) {
    const a = before[f] ?? null;
    const b = f === 'title' ? after.title.trim() : (after[f] ?? null);
    if (a !== b) patch[f] = b;
  }
  return patch as TaskPatch;
}

type Props = {
  task: CardTask | null;
  team: Profile[];
  onClose: () => void;
  onSave: (taskId: string, patch: TaskPatch) => Promise<void>;
};

/** Full-screen sheet with the Capture edit form; Save sends only the changed fields. */
export function EditSheet({ task, team, onClose, onSave }: Props) {
  const { t } = useScreenT(NS);
  const { lang, direction } = useDirection();
  const [original, setOriginal] = useState<ParsedTask | null>(null);
  const [draft, setDraft] = useState<ParsedTask | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = task ? draftFromCard(task, lang) : null;
    setOriginal(d);
    setDraft(d);
    setError(null);
    setSaving(false);
    // only when a different card opens the sheet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  const save = async () => {
    if (!task || !original || !draft) return;
    const patch = diff(original, draft);
    if (Object.keys(patch).length === 0) return onClose();
    setSaving(true);
    setError(null);
    try {
      await onSave(task.id, patch);
      onClose();
    } catch (e) {
      setError((e as Error).message || t('saveFailed'));
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!task} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg, direction }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: spacing.screen,
                paddingVertical: spacing.lg,
              }}
            >
              <AppText variant="title">{t('editTitle')}</AppText>
              <IconButton label={t('close')} onPress={onClose}>
                <X color={colors.text} size={20} strokeWidth={1.9} />
              </IconButton>
            </View>
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              {draft && <EditTask draft={draft} team={team} onChange={setDraft} />}
            </ScrollView>
            <View style={{ paddingHorizontal: spacing.screen, paddingVertical: spacing.lg, gap: spacing.sm }}>
              {error && (
                <AppText variant="small" color="red">
                  {error}
                </AppText>
              )}
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <Button label={t('cancel')} variant="outline" style={{ flex: 1 }} onPress={onClose} />
                <Button
                  label={t('save')}
                  style={{ flex: 1 }}
                  loading={saving}
                  disabled={!draft?.title.trim()}
                  onPress={save}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
