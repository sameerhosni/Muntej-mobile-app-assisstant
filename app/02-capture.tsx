// Screen 02 · Capture — see design/v2/html/Capture.dc.html (Arabic: CaptureAR.dc.html)
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, X } from 'lucide-react-native';
import { AppText, BottomCTA, BOTTOM_CTA_SPACE, Button, Card, IconBadge, IconButton, TextField } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useMyProfile, useTeam } from '@/lib/api';
import { MicButton } from '@/features/home/MicButton';
import { Waveform } from '@/features/capture/Waveform';
import { TaskReview } from '@/features/capture/TaskReview';
import { EditTask } from '@/features/capture/EditTask';
import { MicDeniedError, useVoiceRecorder } from '@/features/capture/useVoiceRecorder';
import { createTask, parseTask, rescalePlan, transcribeAudio, type ParsedTask } from '@/features/capture/api';

type Step =
  | { kind: 'recording' }
  | { kind: 'typing' }
  | { kind: 'working'; label: 'transcribing' | 'understanding' }
  | { kind: 'review'; task: ParsedTask }
  | { kind: 'edit'; task: ParsedTask; draft: ParsedTask }
  | { kind: 'error'; message: string };

export default function CaptureScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { mode } = useLocalSearchParams<{ mode?: 'voice' | 'text' }>();
  const source = mode === 'text' ? 'text' : 'voice';
  const [step, setStep] = useState<Step>(source === 'voice' ? { kind: 'recording' } : { kind: 'typing' });
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const recorder = useVoiceRecorder();
  const team = useTeam();
  const me = useMyProfile();
  const started = useRef(false);

  const understand = useCallback(
    async (sentence: string) => {
      setStep({ kind: 'working', label: 'understanding' });
      try {
        setStep({ kind: 'review', task: await parseTask(sentence) });
      } catch (e) {
        setStep({ kind: 'error', message: (e as Error).message || t('capture.failed') });
      }
    },
    [t],
  );

  const startRecording = useCallback(async () => {
    setStep({ kind: 'recording' });
    try {
      await recorder.start();
    } catch (e) {
      setStep({ kind: 'error', message: e instanceof MicDeniedError ? t('capture.micDenied') : t('capture.failed') });
    }
  }, [recorder, t]);

  // start listening as soon as the screen opens from the mic button
  useEffect(() => {
    if (source === 'voice' && !started.current) {
      started.current = true;
      startRecording();
    }
  }, [source, startRecording]);

  const stopRecording = async () => {
    const duration = recorder.durationMillis;
    const uri = await recorder.stop();
    if (!uri || duration < 800) {
      setStep({ kind: 'error', message: t('capture.tooShort') });
      return;
    }
    setStep({ kind: 'working', label: 'transcribing' });
    try {
      const transcript = await transcribeAudio(uri);
      await understand(transcript);
    } catch (e) {
      setStep({ kind: 'error', message: (e as Error).message || t('capture.failed') });
    }
  };

  // opened from Home → go back; opened directly (deep link / web refresh) → land on Home
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/01-home'));

  const close = async () => {
    if (recorder.isRecording) await recorder.stop().catch(() => {});
    leave();
  };

  const save = async (task: ParsedTask) => {
    setSaving(true);
    try {
      await createTask(task, source);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['tasks'] }),
        qc.invalidateQueries({ queryKey: ['homeStats'] }),
        qc.invalidateQueries({ queryKey: ['activity'] }),
      ]);
      leave();
    } catch (e) {
      setSaving(false);
      setStep({ kind: 'error', message: (e as Error).message || t('capture.failed') });
    }
  };

  const title =
    step.kind === 'recording'
      ? t('capture.listening')
      : step.kind === 'typing'
        ? t('capture.typeTitle')
        : step.kind === 'edit'
          ? t('capture.edit')
          : t('capture.gotIt');

  const hasCTA = step.kind === 'review' || step.kind === 'edit';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.screen,
            paddingTop: 24,
            paddingBottom: hasCTA ? BOTTOM_CTA_SPACE + 16 : 32,
            gap: spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 }}>
              {(step.kind === 'review' || step.kind === 'edit') && (
                <IconBadge size={36} gradient="success">
                  <Check color={colors.onDark} size={18} strokeWidth={2.4} />
                </IconBadge>
              )}
              <AppText variant="titleLg" numberOfLines={1}>
                {title}
              </AppText>
            </View>
            <IconButton label={t('capture.close')} onPress={close}>
              <X color={colors.text} size={20} strokeWidth={1.9} />
            </IconButton>
          </View>

          {step.kind === 'recording' && (
            <View style={{ alignItems: 'center', gap: spacing.xxl, marginTop: 40 }}>
              <Waveform level={recorder.isRecording ? recorder.level : 0} />
              <AppText variant="hero" color="text" style={{ fontSize: 34 }}>
                {formatClock(recorder.durationMillis)}
              </AppText>
              <MicButton label={t('capture.tapToStop')} active={recorder.isRecording} onPress={stopRecording} />
              <AppText color="textMuted">{t('capture.tapToStop')}</AppText>
              <Button
                label={t('capture.typeInstead')}
                variant="outline"
                size="md"
                onPress={async () => {
                  if (recorder.isRecording) await recorder.stop().catch(() => {});
                  setStep({ kind: 'typing' });
                }}
              />
            </View>
          )}

          {step.kind === 'typing' && (
            <View style={{ gap: spacing.xl }}>
              <TextField
                value={text}
                onChangeText={setText}
                placeholder={t('capture.typePlaceholder')}
                multiline
                autoFocus
                style={{ minHeight: 120, textAlignVertical: 'top' }}
              />
              <Button label={t('capture.understand')} disabled={!text.trim()} onPress={() => understand(text.trim())} />
            </View>
          )}

          {step.kind === 'working' && (
            <View style={{ alignItems: 'center', gap: spacing.xxl, marginTop: 60 }}>
              <Waveform />
              <ActivityIndicator color={colors.primary} />
              <AppText color="textMuted">{t(`capture.${step.label}`)}</AppText>
            </View>
          )}

          {step.kind === 'review' && (
            <TaskReview task={step.task} team={team.data ?? []} />
          )}

          {step.kind === 'edit' && (
            <EditTask
              draft={step.draft}
              team={team.data ?? []}
              meId={me.data?.id}
              onChange={(draft) => setStep({ ...step, draft })}
            />
          )}

          {step.kind === 'error' && (
            <Card style={{ marginTop: 24 }}>
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
                <IconBadge size={32} bg="redTint" round>
                  <AlertTriangle color={colors.red} size={16} strokeWidth={2.1} />
                </IconBadge>
                <AppText color="textSoft" style={{ flex: 1 }}>
                  {step.message}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                {source === 'voice' && (
                  <Button label={t('capture.tryAgain')} size="md" style={{ flex: 1 }} onPress={startRecording} />
                )}
                <Button
                  label={t('capture.typeInstead')}
                  variant="outline"
                  size="md"
                  style={{ flex: 1 }}
                  onPress={() => setStep({ kind: 'typing' })}
                />
              </View>
            </Card>
          )}
        </ScrollView>

        {step.kind === 'review' && (
          <BottomCTA
            primary={{ label: t('capture.doneForget'), onPress: () => save(step.task), loading: saving }}
            secondary={{ label: t('capture.edit'), onPress: () => setStep({ kind: 'edit', task: step.task, draft: step.task }) }}
          />
        )}
        {step.kind === 'edit' && (
          <BottomCTA
            primary={{
              label: t('capture.save'),
              disabled: !step.draft.title.trim(),
              onPress: () =>
                setStep({
                  kind: 'review',
                  task: {
                    ...step.draft,
                    followup_plan: rescalePlan(step.draft.followup_plan, step.task.due_at, step.draft.due_at),
                  },
                }),
            }}
            secondary={{ label: t('capture.cancel'), onPress: () => setStep({ kind: 'review', task: step.task }) }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatClock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
