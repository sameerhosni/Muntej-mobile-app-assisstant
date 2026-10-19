// Screen 02 · Capture — see design/v2/html/Capture.dc.html (Arabic: CaptureAR.dc.html)
// Now the Muntej chat: one continuous conversation; the muntej-chat Edge Function decides whether to reply,
// create a task (saved immediately) or update a recent one. Task cards support Undo / Edit / fill-in-missing.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';
import { AppText, IconButton } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTeam } from '@/lib/api';
import { MicDeniedError, useVoiceRecorder } from '@/features/capture/useVoiceRecorder';
import { transcribeAudio } from '@/features/capture/api';
import { personName } from '@/features/capture/TaskReview';
import {
  appendToChat,
  chatKey,
  invalidateTaskData,
  mergeTask,
  sendChat,
  undoChatTask,
  updateTaskFromChat,
  useChat,
  type CardTask,
  type ChatSource,
  type MissingItem,
  type TaskPatch,
} from '@/features/chat/api';
import { MuntejAvatar, MuntejBubble, MuntejText, NoticeBubble, TypingBubble, UserBubble } from '@/features/chat/Bubbles';
import { TaskCard } from '@/features/chat/TaskCard';
import { Composer, type VoiceState } from '@/features/chat/Composer';
import { EditSheet } from '@/features/chat/EditSheet';
import { NS } from '@/features/chat/strings';

type Pending = { content: string; source: ChatSource; at: string; status: 'sending' | 'error'; error?: string };

const EXAMPLES = ['ex1', 'ex2', 'ex3'] as const;

export default function MuntejChatScreen() {
  const { t } = useScreenT(NS);
  const { t: tg } = useTranslation();
  const { lang } = useDirection();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { mode } = useLocalSearchParams<{ mode?: 'voice' | 'text' }>();

  const chat = useChat();
  const team = useTeam();
  const me = useMyProfile();
  const recorder = useVoiceRecorder();

  const [text, setText] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoiceState>('idle');
  const [undone, setUndone] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<CardTask | null>(null);

  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const started = useRef(false);

  const timeFmt = useMemo(() => {
    const f = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { hour: 'numeric', minute: '2-digit' });
    return (iso: string) => {
      try {
        return f.format(new Date(iso));
      } catch {
        return '';
      }
    };
  }, [lang]);

  // ── sending ────────────────────────────────────────────────────────────────
  const send = useCallback(
    async (raw: string, source: ChatSource) => {
      const content = raw.trim();
      if (!content) return;
      setNotice(null);
      const p: Pending = { content, source, at: new Date().toISOString(), status: 'sending' };
      setPending(p);
      try {
        const rows = await sendChat(content, source);
        appendToChat(qc, rows);
        setPending(null);
        qc.invalidateQueries({ queryKey: chatKey });
        if (rows.some((r) => r.action === 'created' || r.action === 'updated')) invalidateTaskData(qc);
      } catch (e) {
        setPending({ ...p, status: 'error', error: (e as Error).message || t('failed') });
      }
    },
    [qc, t],
  );

  const busy = pending?.status === 'sending';

  const sendTyped = () => {
    if (busy || !text.trim()) return;
    const v = text;
    setText('');
    send(v, 'text');
  };

  // ── voice ──────────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setNotice(null);
    setVoice('recording');
    try {
      await recorder.start();
    } catch (e) {
      setVoice('idle');
      setNotice(e instanceof MicDeniedError ? tg('capture.micDenied') : tg('capture.failed'));
    }
  }, [recorder, tg]);

  // opened from the mic button → start listening right away
  useEffect(() => {
    if (mode === 'voice' && !started.current) {
      started.current = true;
      startRecording();
    }
  }, [mode, startRecording]);

  const stopRecording = async () => {
    const duration = recorder.durationMillis;
    const uri = await recorder.stop().catch(() => null);
    if (!uri || duration < 800) {
      setVoice('idle');
      setNotice(tg('capture.tooShort'));
      return;
    }
    setVoice('transcribing');
    try {
      const transcript = await transcribeAudio(uri);
      setVoice('idle');
      if (transcript.trim()) await send(transcript, 'voice');
      else setNotice(tg('capture.tooShort'));
    } catch (e) {
      setVoice('idle');
      setNotice((e as Error).message || tg('capture.failed'));
    }
  };

  const cancelRecording = async () => {
    if (recorder.isRecording) await recorder.stop().catch(() => {});
    setVoice('idle');
  };

  // ── leaving ────────────────────────────────────────────────────────────────
  // opened from Home → go back; opened directly (deep link / web refresh) → land on Home
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/01-home'));
  const close = async () => {
    if (recorder.isRecording) await recorder.stop().catch(() => {});
    leave();
  };

  // ── task cards ─────────────────────────────────────────────────────────────
  const messages = chat.data?.messages ?? [];
  const liveTasks = chat.data?.tasks ?? {};

  // only the newest card per task is shown (it carries the latest state)
  const latestCardFor = useMemo(() => {
    const m = new Map<string, string>();
    for (const msg of messages) if (msg.payload && msg.task_id) m.set(msg.task_id, msg.id);
    return m;
  }, [messages]);

  const undo = async (taskId: string) => {
    setUndone((s) => new Set(s).add(taskId));
    try {
      await undoChatTask(taskId);
      await Promise.all([qc.invalidateQueries({ queryKey: chatKey }), invalidateTaskData(qc)]);
    } catch {
      setUndone((s) => {
        const n = new Set(s);
        n.delete(taskId);
        return n;
      });
      setNotice(t('undoFailed'));
    }
  };

  const saveEdit = async (taskId: string, patch: TaskPatch) => {
    await updateTaskFromChat(taskId, patch);
    await Promise.all([qc.invalidateQueries({ queryKey: chatKey }), invalidateTaskData(qc)]);
  };

  const fillMissing = (item: MissingItem) => {
    setText(t(`s_${item}`));
    setTimeout(() => input.current?.focus(), 50);
  };

  const firstName = me.data ? personName(me.data, lang).split(' ')[0] : '';
  const empty = !chat.isLoading && !chat.isError && messages.length === 0 && !pending;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View
        style={{
          backgroundColor: colors.surface,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          boxShadow: shadows.card,
          paddingTop: insets.top + 4,
          paddingBottom: spacing.xl,
          paddingStart: spacing.screen,
          paddingEnd: 18,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.lg,
          zIndex: 1,
        }}
      >
        <View style={{ width: 46, height: 46, borderRadius: 23, boxShadow: shadows.primary }}>
          <MuntejAvatar size={46} />
          <View
            style={{
              position: 'absolute',
              end: 0,
              bottom: 1,
              width: 11,
              height: 11,
              borderRadius: 6,
              backgroundColor: colors.green,
              borderWidth: 2,
              borderColor: colors.surface,
            }}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="title" display>
            {t('title')}
          </AppText>
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {t('subtitle')}
          </AppText>
        </View>
        <IconButton label={t('close')} onPress={close}>
          <X color={colors.text} size={20} strokeWidth={1.9} />
        </IconButton>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl, paddingBottom: spacing.xxl, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        {chat.isLoading && (
          <View style={{ alignItems: 'center', gap: spacing.sm, marginTop: 40 }}>
            <ActivityIndicator color={colors.primary} />
            <AppText color="textMuted">{t('loading')}</AppText>
          </View>
        )}

        {chat.isError && (
          <NoticeBubble text={t('loadFailed')} retryLabel={t('retry')} onRetry={() => chat.refetch()} />
        )}

        {empty && (
          <>
            <MuntejBubble>
              <MuntejText text={firstName ? t('welcomeName', { name: firstName }) : t('welcome')} />
            </MuntejBubble>
            <View style={{ gap: spacing.sm, paddingStart: 38 }}>
              <AppText variant="caption" weight="bold" color="textMuted">
                {t('tryOne')}
              </AppText>
              {EXAMPLES.map((k) => (
                <Pressable
                  key={k}
                  onPress={() => send(t(k), 'text')}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    alignSelf: 'flex-start',
                    minHeight: sizes.touch,
                    justifyContent: 'center',
                    paddingHorizontal: 18,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: colors.borderBlue,
                    backgroundColor: colors.surface,
                    boxShadow: shadows.tile,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <AppText weight="bold" color="primary">
                    {t(k)}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {messages.map((m) => {
          if (m.role === 'user') return <UserBubble key={m.id} text={m.content} time={timeFmt(m.created_at)} />;
          const showCard = !!m.payload && !!m.task_id && latestCardFor.get(m.task_id) === m.id;
          let card = null;
          if (showCard && m.payload) {
            const task = mergeTask(m.payload, liveTasks[m.payload.id]);
            const isUndone = undone.has(task.id) || task.status === 'cancelled' || m.action === 'undone';
            card = (
              <TaskCard
                task={task}
                action={m.action}
                team={team.data ?? []}
                undone={isUndone}
                onUndo={() => undo(task.id)}
                onEdit={() => setEditing(task)}
                onMissing={fillMissing}
              />
            );
          }
          return (
            <MuntejBubble key={m.id} time={timeFmt(m.created_at)} below={card}>
              <MuntejText text={m.content} />
            </MuntejBubble>
          );
        })}

        {pending && (
          <UserBubble
            text={pending.content}
            time={timeFmt(pending.at)}
            failed={pending.status === 'error' ? t('notSent') : undefined}
          />
        )}
        {pending?.status === 'sending' && <TypingBubble label={t('thinking')} />}
        {pending?.status === 'error' && (
          <NoticeBubble
            text={pending.error ?? t('failed')}
            retryLabel={t('retry')}
            onRetry={() => send(pending.content, pending.source)}
          />
        )}
        {notice && <NoticeBubble text={notice} />}
      </ScrollView>

      <Composer
        value={text}
        onChangeText={setText}
        onSend={sendTyped}
        onMic={startRecording}
        busy={busy}
        autoFocus={mode === 'text'}
        inputRef={input}
        voice={voice}
        level={recorder.isRecording ? recorder.level : 0}
        durationMs={recorder.durationMillis}
        onStop={stopRecording}
        onCancel={cancelRecording}
        bottomInset={insets.bottom}
      />

      <EditSheet task={editing} team={team.data ?? []} onClose={() => setEditing(null)} onSave={saveEdit} />
    </KeyboardAvoidingView>
  );
}
