// The task's steps (task page). Muntej suggests a breakdown (big / vague tasks by themselves, others on "Break it
// down"; "like last time" when a similar task was done before); add more by typing (Enter keeps going), pasting a list
// (one step per line) or saying them; tap a step to give it a person / date or delete it. Progress follows the steps
// (server trigger); Saree3 cheers each one, and when the last is ticked Muntej offers to mark the task finished.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, TextInput, View } from 'react-native';
import { Check, Mic, Sparkles, Square } from 'lucide-react-native';
import { AppText, Button, Card, Chip, TextField } from '@/components/ui';
import { colors, fontFamily, fontSize, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTeam, type TaskWithPeople } from '@/lib/api';
import { formatDue } from '@/features/capture/format';
import { contentDirection } from '@/features/chat/Bubbles';
import { MicDeniedError, useVoiceRecorder } from '@/features/capture/useVoiceRecorder';
import { transcribeAudio } from '@/features/capture/api';
import { munti } from '@/features/munti/store';
import { useCompleteTask, isFinished } from '@/features/tasks/useCompleteTask';
import { dueIn, useStepActions, useStepSuggestion, type Step } from './api';
import { STEPS_NS } from './strings';

type Props = { task: TaskWithPeople & { subtasks?: Step[]; definition_of_done?: string | null; estimate_hours?: number | null } };

export function StepsSection({ task }: Props) {
  const { t } = useScreenT(STEPS_NS);
  const { lang } = useDirection();
  const me = useMyProfile();
  const team = useTeam();
  const actions = useStepActions();
  const { toggle: completeTask, canTick } = useCompleteTask();
  const steps = useMemo(() => [...(task.subtasks ?? [])].sort((a, b) => a.position - b.position), [task.subtasks]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Step | null>(null);
  const [asked, setAsked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  // big or vague tasks get Muntej's breakdown by themselves; others on "Break it down"
  const big = (task.estimate_hours ?? 0) > 4 || !task.definition_of_done?.trim();
  const open = !isFinished(task.status) && task.status !== 'cancelled';
  const suggestion = useStepSuggestion(task.id, open && steps.length === 0 && !dismissed && (big || asked));

  const first = (id: string | null) => {
    const p = id ? (team.data ?? []).find((x) => x.id === id) : undefined;
    return p ? ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0] : null;
  };
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || t('error'));
    } finally {
      setBusy(null);
    }
  };

  // typing: Enter adds and keeps the box ready; a pasted list (several lines) adds one step per line
  const onDraft = (v: string) => {
    if (v.includes('\n')) {
      const lines = v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      setDraft('');
      if (lines.length) run('add', () => actions.add(task.id, lines));
      return;
    }
    setDraft(v);
  };
  const addDraft = () => {
    const v = draft.trim();
    if (!v) return;
    setDraft('');
    run('add', () => actions.add(task.id, [v]));
  };

  // saying them: record → write down → Muntej splits into steps with a person / date when named
  const recorder = useVoiceRecorder();
  const [voice, setVoice] = useState<'idle' | 'rec' | 'work'>('idle');
  const toggleVoice = async () => {
    if (voice === 'rec') {
      setVoice('work');
      const uri = await recorder.stop().catch(() => null);
      try {
        if (!uri || recorder.wasSilent()) throw new Error(t('saidNone'));
        const text = await transcribeAudio(uri);
        const { steps: parsed } = await actions.parse(task.id, text);
        if (!parsed.length) throw new Error(t('saidNone'));
        for (const s of parsed) await actions.add(task.id, [s.title], s.owner_id, s.due_at);
      } catch (e) {
        setError((e as Error).message || t('error'));
      } finally {
        setVoice('idle');
      }
      return;
    }
    setError(null);
    try {
      await recorder.start();
      setVoice('rec');
    } catch (e) {
      setError(e instanceof MicDeniedError ? t('error') : (e as Error).message);
    }
  };

  const tick = (s: Step) => {
    const done = !(optimistic[s.id] ?? s.done);
    setOptimistic((m) => ({ ...m, [s.id]: done }));
    run(`tick:${s.id}`, async () => {
      await actions.tick(s.id, done);
      if (done) {
        const left = steps.filter((x) => x.id !== s.id && !(optimistic[x.id] ?? x.done)).length;
        munti.flash('green');
        munti.say(left === 0 ? t('cheerLast') : t('cheer', { count: left, n: left }), 'celebrate', { ms: 3500 });
      }
    }).finally(() => setOptimistic((m) => {
      const { [s.id]: _x, ...rest } = m;
      return rest;
    }));
  };

  const doneCount = steps.filter((s) => optimistic[s.id] ?? s.done).length;
  const allDone = steps.length > 0 && doneCount === steps.length;
  const sug = suggestion.data;
  const chosen = sug ? sug.steps.filter((_, i) => picked[i] !== false) : [];

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="section">{t('title')}</AppText>
        {steps.length > 0 && (
          <View style={{ backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3 }}>
            <AppText variant="caption" weight="extrabold" color="green">
              {`${doneCount} / ${steps.length}`}
            </AppText>
          </View>
        )}
      </View>

      {/* the steps */}
      {steps.length > 0 && (
        <Card padding={0} style={{ paddingHorizontal: spacing.lg, gap: 0, overflow: 'hidden' }}>
          {steps.map((s, i) => {
            const done = optimistic[s.id] ?? s.done;
            const line = [first(s.owner_id), s.due_at ? formatDue(s.due_at, lang) : null].filter(Boolean).join(' · ');
            const late = !done && !!s.due_at && Date.parse(s.due_at) < Date.now();
            return (
              <View
                key={s.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: i === steps.length - 1 ? 0 : 1, borderBottomColor: colors.border }}
              >
                <Pressable
                  onPress={() => tick(s)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={s.title}
                  style={{ width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      borderWidth: 2,
                      borderColor: done ? colors.green : late ? colors.red : colors.borderBlue,
                      backgroundColor: done ? colors.green : colors.transparent,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {done && <Check color={colors.onDark} size={13} strokeWidth={3} />}
                  </View>
                </Pressable>
                <Pressable onPress={() => setEditing(s)} accessibilityRole="button" accessibilityLabel={`${t('edit')}: ${s.title}`} style={{ flex: 1, minHeight: sizes.touch, justifyContent: 'center', paddingVertical: 6 }}>
                  <AppText
                    color={done ? 'textFaint' : 'text'}
                    numberOfLines={2}
                    style={{ textDecorationLine: done ? 'line-through' : 'none', writingDirection: contentDirection(s.title) }}
                  >
                    {s.title}
                  </AppText>
                  {!!line && (
                    <AppText variant="caption" color={late ? 'red' : 'textMuted'}>
                      {line}
                    </AppText>
                  )}
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}

      {/* all ticked → offer to finish the task */}
      {allDone && open && canTick(task) && (
        <Card tone="green" padding={spacing.lg} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <AppText weight="bold" color="greenText">
              {t('allDoneTitle')}
            </AppText>
            <AppText variant="small" color="greenText">
              {t('allDoneAsk')}
            </AppText>
          </View>
          <Button label={t('finish')} size="md" loading={busy === 'finish'} onPress={() => run('finish', async () => void (await completeTask(task)))} />
        </Card>
      )}

      {/* Muntej's breakdown */}
      {open && steps.length === 0 && !dismissed && (
        <Card style={{ gap: spacing.md, borderWidth: 1, borderColor: colors.purpleBorder }}>
          {!sug && !suggestion.isFetching ? (
            <Pressable
              onPress={() => setAsked(true)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                minHeight: sizes.touch,
                borderRadius: radius.pill,
                backgroundColor: colors.purpleTint,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Sparkles color={colors.purple} size={16} strokeWidth={2} />
              <AppText weight="bold" color="purple">
                {t('breakDown')}
              </AppText>
            </Pressable>
          ) : suggestion.isFetching ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <ActivityIndicator color={colors.purple} />
              <AppText color="textMuted">{t('thinking')}</AppText>
            </View>
          ) : sug ? (
            <>
              <View style={{ gap: 2 }}>
                <AppText weight="bold" color="purple">
                  {t('suggestTitle')}
                </AppText>
                {sug.source === 'last_time' && sug.like_task_title && (
                  <AppText variant="caption" color="textMuted">
                    {t('likeLastTime', { title: sug.like_task_title })}
                  </AppText>
                )}
              </View>
              <View style={{ gap: 4 }}>
                {sug.steps.map((s, i) => {
                  const on = picked[i] !== false;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => setPicked((m) => ({ ...m, [i]: !on }))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.touch - 6 }}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          borderWidth: 2,
                          borderColor: on ? colors.purple : colors.borderBlue,
                          backgroundColor: on ? colors.purple : colors.transparent,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {on && <Check color={colors.onDark} size={12} strokeWidth={3} />}
                      </View>
                      <AppText style={{ flex: 1, writingDirection: contentDirection(s) }} color={on ? 'text' : 'textFaint'}>
                        {i + 1}. {s}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label={t('notNow')} variant="outline" size="md" onPress={() => setDismissed(true)} style={{ flex: 1 }} />
                <Button
                  label={t('addAll')}
                  tone="purple"
                  size="md"
                  disabled={!chosen.length}
                  loading={busy === 'sug'}
                  onPress={() => run('sug', () => actions.add(task.id, chosen))}
                  style={{ flex: 1.4 }}
                />
              </View>
            </>
          ) : null}
        </Card>
      )}

      {/* add: type (Enter keeps going), paste a list, or say them */}
      {open && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <TextInput
            value={draft}
            onChangeText={onDraft}
            onSubmitEditing={addDraft}
            blurOnSubmit={false}
            returnKeyType="done"
            placeholder={voice === 'rec' ? t('listening') : voice === 'work' ? t('working') : t('addPlaceholder')}
            placeholderTextColor={voice === 'idle' ? colors.textFaint : colors.primary}
            selectionColor={colors.primary}
            accessibilityLabel={t('addPlaceholder')}
            editable={voice === 'idle'}
            style={{
              flex: 1,
              minHeight: sizes.touch,
              borderRadius: radius.tile,
              borderWidth: 1,
              borderColor: colors.borderBlue,
              backgroundColor: colors.surface,
              paddingHorizontal: spacing.lg,
              color: colors.text,
              fontSize: fontSize.body,
              fontFamily: fontFamily[lang].regular,
              writingDirection: contentDirection(draft || (lang === 'ar' ? 'ا' : 'a')),
              textAlign: contentDirection(draft || (lang === 'ar' ? 'ا' : 'a')) === 'rtl' ? 'right' : 'left',
            }}
          />
          {draft.trim() ? (
            <Button label={t('add')} size="md" loading={busy === 'add'} onPress={addDraft} />
          ) : (
            <Pressable
              onPress={toggleVoice}
              disabled={voice === 'work'}
              accessibilityRole="button"
              accessibilityLabel={t('sayIt')}
              style={({ pressed }) => ({
                width: sizes.touch,
                height: sizes.touch,
                borderRadius: sizes.touch / 2,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: voice === 'rec' ? colors.red : colors.primaryTint,
                boxShadow: voice === 'rec' ? shadows.primary : undefined,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {voice === 'work' ? (
                <ActivityIndicator color={colors.primary} />
              ) : voice === 'rec' ? (
                <Square color={colors.onDark} fill={colors.onDark} size={14} />
              ) : (
                <Mic color={colors.primary} size={18} strokeWidth={2} />
              )}
            </Pressable>
          )}
        </View>
      )}

      {error && (
        <AppText variant="caption" color="red">
          {error}
        </AppText>
      )}

      {editing && (
        <StepSheet
          step={editing}
          meId={me.data?.id ?? null}
          onClose={() => setEditing(null)}
          onSave={(patch) => run('save', async () => {
            await actions.set(editing.id, patch);
            setEditing(null);
          })}
          onDelete={() => run('del', async () => {
            await actions.remove(editing.id);
            setEditing(null);
          })}
        />
      )}
    </View>
  );
}

/** change one step: its words, who does it, by when — or delete it */
function StepSheet({
  step,
  meId,
  onClose,
  onSave,
  onDelete,
}: {
  step: Step;
  meId: string | null;
  onClose: () => void;
  onSave: (p: { title?: string; owner_id?: string | null; due_at?: string | null }) => void;
  onDelete: () => void;
}) {
  const { t } = useScreenT(STEPS_NS);
  const { lang } = useDirection();
  const team = useTeam();
  const [title, setTitle] = useState(step.title);
  const [owner, setOwner] = useState<string | null>(step.owner_id);
  const [due, setDue] = useState<string | null>(step.due_at ?? null);
  const people = (team.data ?? []).filter((p) => p.status !== 'deleted');
  const name = (p: { full_name: string; full_name_ar: string | null }) => ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0];
  const dates: { key: string; label: string; v: string | null }[] = [
    { key: 'today', label: t('today'), v: dueIn(0) },
    { key: 'tomorrow', label: t('tomorrow'), v: dueIn(1) },
    { key: 'in3', label: t('in3'), v: dueIn(3) },
    { key: 'week', label: t('nextWeek'), v: dueIn(5) },
    { key: 'none', label: t('noDate'), v: null },
  ];
  const sameDay = (a: string | null, b: string | null) => (!a && !b) || (!!a && !!b && a.slice(0, 10) === b.slice(0, 10));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(11,26,51,0.35)' }} onPress={onClose} accessibilityLabel={t('cancel')} />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.cardLg, borderTopRightRadius: radius.cardLg, padding: spacing.screen, gap: spacing.md }}>
        <AppText variant="section">{t('edit')}</AppText>
        <TextField label={t('stepTitle')} value={title} onChangeText={setTitle} />
        <AppText variant="small" weight="semibold" color="textMuted">
          {t('who')}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Chip label={t('nobody')} selected={owner === null} onPress={() => setOwner(null)} />
          {people.map((p) => (
            <Chip key={p.id} label={p.id === meId ? t('me') : name(p)} selected={owner === p.id} onPress={() => setOwner(p.id)} />
          ))}
        </View>
        <AppText variant="small" weight="semibold" color="textMuted">
          {t('when')}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {dates.map((d) => (
            <Chip key={d.key} label={d.label} selected={sameDay(due, d.v)} onPress={() => setDue(d.v)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label={t('delete')} variant="ghost" size="md" onPress={onDelete} style={{ flex: 1 }} />
          <Button label={t('save')} size="md" disabled={!title.trim()} onPress={() => onSave({ title: title.trim(), owner_id: owner, due_at: due })} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}
