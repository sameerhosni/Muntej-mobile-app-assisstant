// Screen · New task by hand (no mockup). For people who chose "Not now" on AI (app/ai-consent.tsx): what, who, when and
// how urgent, saved with create_task_with_plan like any other task (so follow-ups, decisions and review still work), with
// two plain reminders instead of the AI's follow-up plan. Nothing here goes to the AI.
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AppText, Button, Chip, IconButton, Screen, TextField } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTeam } from '@/lib/api';
import type { TaskPriority } from '@/lib/api/types';
import { createTask, type FollowupStep, type ParsedTask } from '@/features/capture/api';
import { invalidateTaskData } from '@/features/chat/api';
import { homeRouteFor } from '@/features/screens/registry';
import { track } from '@/lib/analytics';
import { AI_NS } from '@/features/ai-consent/strings';
import { useAssignable } from '@/features/tasks/assignable';

const DAY = 86_400_000;
type When = 'none' | 'today' | 'tomorrow' | 'in3' | 'week';
const WHEN: { key: When; label: string; days: number | null }[] = [
  { key: 'none', label: 'nNone', days: null },
  { key: 'today', label: 'nToday', days: 0 },
  { key: 'tomorrow', label: 'nTomorrow', days: 1 },
  { key: 'in3', label: 'nIn3', days: 3 },
  { key: 'week', label: 'nWeek', days: 7 },
];
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

/** 5 PM Riyadh (UTC+3) on the day that many days from today */
function dueOn(days: number): string {
  const riyadhToday = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  return new Date(Date.parse(`${riyadhToday}T14:00:00Z`) + days * DAY).toISOString();
}

export default function NewTaskScreen() {
  const { t } = useScreenT(AI_NS);
  const { isRTL, lang } = useDirection();
  const qc = useQueryClient();
  const me = useMyProfile();
  const team = useTeam();
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState<string | null>(null);
  const [when, setWhen] = useState<When>('tomorrow');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meId = me.data?.id;
  // your team and people at your level in other teams (owner, 8 Nov); the database decides who that is
  const mayGive = useAssignable();
  const people = useMemo(
    () => (team.data ?? []).filter((p) => p.id !== meId && p.status !== 'deleted' && mayGive(p.id)),
    [team.data, meId, mayGive],
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace(homeRouteFor(me.data?.role) as Href));

  const save = async () => {
    const what = title.trim();
    if (!what) return setError(t('nNeedTitle'));
    setBusy(true);
    setError(null);
    const days = WHEN.find((w) => w.key === when)?.days ?? null;
    const due = days === null ? null : dueOn(days);
    // two plain reminders: the day before (when there is one) and the morning it's due
    const plan: FollowupStep[] = [];
    if (due && days! >= 2) plan.push({ at: new Date(Date.parse(due) - DAY - 8 * 3_600_000).toISOString(), kind: 'check', channel: 'in_app', summary: t('nRemind', { title: what }), message: t('nRemind', { title: what }) });
    if (due && days! >= 1) plan.push({ at: new Date(Date.parse(due) - 8 * 3_600_000).toISOString(), kind: 'check', channel: 'in_app', summary: t('nDue', { title: what }), message: t('nDue', { title: what }) });
    const task: ParsedTask = {
      language: lang,
      transcript: '',
      title: what,
      owner_id: owner ?? meId ?? null,
      helper_id: null,
      helper_reason: null,
      due_at: due,
      priority,
      goal: null,
      definition_of_done: null,
      budget: null,
      workspace_id: null,
      missing: [],
      followup_plan: plan,
    };
    try {
      const id = await createTask(task, 'text');
      track('task_created_by_hand', { assigned: !!owner });
      await invalidateTaskData(qc);
      router.replace({ pathname: '/14-task-detail', params: { id } } as Href);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen bottomInset={40}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconButton label={t('back')} onPress={back}>
          <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </IconButton>
        <AppText variant="titleLg">{t('nTitle')}</AppText>
      </View>
      <TextField label={t('nWhat')} placeholder={t('nWhatPh')} value={title} onChangeText={setTitle} autoFocus />
      {people.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="cardTitle">{t('nWho')}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Chip label={t('nMe')} selected={!owner} onPress={() => setOwner(null)} />
            {people.map((p) => (
              <Chip
                key={p.id}
                label={(lang === 'ar' && p.full_name_ar) || p.full_name}
                selected={owner === p.id}
                onPress={() => setOwner(p.id)}
              />
            ))}
          </View>
        </View>
      )}
      <View style={{ gap: spacing.sm }}>
        <AppText variant="cardTitle">{t('nWhen')}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {WHEN.map((w) => (
            <Chip key={w.key} label={t(w.label)} selected={when === w.key} onPress={() => setWhen(w.key)} />
          ))}
        </View>
      </View>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="cardTitle">{t('nPriority')}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {PRIORITIES.map((p) => (
            <Chip key={p} label={t(`p_${p}`)} selected={priority === p} onPress={() => setPriority(p)} />
          ))}
        </View>
      </View>
      {!!error && <AppText color="red">{error}</AppText>}
      <Button label={t('nSave')} size="lg" loading={busy} onPress={save} />
    </Screen>
  );
}
