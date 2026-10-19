// "Link tasks" picker: the user's open tasks with no objective. Each tap links (or, tapped again, unlinks) via link_task.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';
import { AppText, Avatar, Button, Card, IconButton, SearchField } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useTasks, type TaskWithPeople } from '@/lib/api';
import { formatDue } from '@/features/capture/format';
import { matchesTask } from '@/features/tasks/model';
import { useLinkTask } from './api';
import { NS } from './strings';

const isOpen = (t: TaskWithPeople) => t.status !== 'done' && t.status !== 'cancelled';

export function LinkTasksSheet({ objectiveId, visible, onClose }: { objectiveId: string; visible: boolean; onClose: () => void }) {
  const { t } = useScreenT(NS);
  const { lang, direction } = useDirection();
  const insets = useSafeAreaInsets();
  const tasks = useTasks();
  const link = useLinkTask();
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      (tasks.data ?? []).filter(
        (x) => isOpen(x) && (!x.objective_id || (touched.has(x.id) && x.objective_id === objectiveId)) && matchesTask(x, search),
      ),
    [tasks.data, touched, objectiveId, search],
  );

  const toggle = async (x: TaskWithPeople) => {
    setBusy(x.id);
    setError(null);
    setTouched((s) => new Set(s).add(x.id));
    try {
      await link.mutateAsync({ taskId: x.id, objectiveId: x.objective_id === objectiveId ? null : objectiveId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const close = () => {
    setTouched(new Set());
    setSearch('');
    setError(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={{ flex: 1, direction, backgroundColor: colors.bg, paddingTop: Platform.OS === 'android' ? insets.top : 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.screen, paddingTop: spacing.lg }}>
          <AppText variant="title" style={{ flex: 1 }}>
            {t('linkTitle')}
          </AppText>
          <IconButton label={t('close')} onPress={close}>
            <X color={colors.text} size={20} strokeWidth={2} />
          </IconButton>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: spacing.screen, paddingBottom: 40, gap: spacing.md }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AppText variant="small" color="textMuted">
            {t('linkHint')}
          </AppText>
          <SearchField value={search} onChangeText={setSearch} placeholder={t('linkSearch')} clearLabel={t('clearSearch')} />
          {error && (
            <Card tone="red" padding={spacing.lg}>
              <AppText variant="small" color="red">
                {error}
              </AppText>
            </Card>
          )}
          {tasks.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : rows.length === 0 ? (
            <AppText color="textMuted" align="center" style={{ marginTop: spacing.xxl }}>
              {search ? t('nothingHere') : t('linkEmpty')}
            </AppText>
          ) : (
            rows.map((x) => {
              const on = x.objective_id === objectiveId;
              const owner = x.owner ? ((lang === 'ar' && x.owner.full_name_ar) || x.owner.full_name).split(' ')[0] : null;
              return (
                <Pressable
                  key={x.id}
                  onPress={() => toggle(x)}
                  disabled={busy === x.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, busy: busy === x.id }}
                  accessibilityLabel={x.title}
                  style={({ pressed }) => ({
                    minHeight: sizes.touch + 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    padding: spacing.lg,
                    borderRadius: radius.tile,
                    backgroundColor: on ? colors.primaryTint : colors.surface,
                    borderWidth: 1,
                    borderColor: on ? colors.primary : colors.border,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 7,
                      borderWidth: 2,
                      borderColor: on ? colors.primary : colors.borderBlue,
                      backgroundColor: on ? colors.primary : colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {busy === x.id ? (
                      <ActivityIndicator size="small" color={on ? colors.onDark : colors.primary} />
                    ) : (
                      on && <Check color={colors.onDark} size={15} strokeWidth={3} />
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <AppText weight="bold" numberOfLines={2}>
                      {x.title}
                    </AppText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {owner && <Avatar name={owner} size={18} />}
                      <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {[owner, x.due_at ? formatDue(x.due_at, lang) : null].filter(Boolean).join(' · ')}
                      </AppText>
                    </View>
                  </View>
                  {on && (
                    <AppText variant="caption" weight="bold" color="primary">
                      {t('linked')}
                    </AppText>
                  )}
                </Pressable>
              );
            })
          )}
          <Button label={t('done')} onPress={close} style={{ marginTop: spacing.md }} />
        </ScrollView>
      </View>
    </Modal>
  );
}
