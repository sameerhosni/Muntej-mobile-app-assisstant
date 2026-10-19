// Screen 02 · Capture — see design/v2/html/Capture.dc.html (Arabic: CaptureAR.dc.html)
// Now the Muntej chat: one continuous conversation; the muntej-chat Edge Function decides whether to reply,
// create a task (saved immediately), update, cancel or delete one. Everything is changed by talking: no edit page.
// Task cards offer Cancel / Delete and fill-in-missing chips; optional next-step suggestions sit under the latest reply.
// Focus: opened with ?focus=<task id> (or "Talk about this" / picking a candidate) the chat is locked on that task and
// every message changes it directly. Without focus, describing a task gives a proposed change the user must confirm.
// Team changes ("add Reem under Khalid", "Noura left") always come as an OrgProposalCard: saved only on Confirm.
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
import { useMyProfile, useTask, useTeam } from '@/lib/api';
import { MicDeniedError, useVoiceRecorder } from '@/features/capture/useVoiceRecorder';
import { transcribeAudio } from '@/features/capture/api';
import { personName } from '@/features/capture/TaskReview';
import {
  appendToChat,
  chatKey,
  confirmChange,
  confirmOrg,
  confirmObjective,
  invalidateObjectiveData,
  objectiveDone,
  objectiveProposal,
  invalidateTaskData,
  invalidateTeamData,
  isCandidates,
  mergeTask,
  orgDone,
  orgProposal,
  sendChat,
  cancelTask,
  deleteTask,
  taskSnapshot,
  useChat,
  type ChatSource,
  type MissingItem,
  type OrgPatch,
  type ObjectiveOp,
  type ObjectivePatch,
  type TaskSnapshot,
} from '@/features/chat/api';
import { OrgProposalCard, type OrgProposalState } from '@/features/chat/OrgProposalCard';
import { ObjectiveProposalCard, type ObjectiveProposalState } from '@/features/chat/ObjectiveProposalCard';
import { MuntejAvatar, MuntejBubble, MuntejText, NoticeBubble, TypingBubble, UserBubble } from '@/features/chat/Bubbles';
import { ProposalCard, TaskCard, type CardState, type ProposalState } from '@/features/chat/TaskCard';
import { Suggestions } from '@/features/chat/Suggestions';
import { Candidates } from '@/features/chat/Candidates';
import { FocusBar } from '@/features/chat/FocusBar';
import { Composer, type VoiceState } from '@/features/chat/Composer';
import { NS } from '@/features/chat/strings';
import { munti } from '@/features/munti/store';
import { MUNTI_NS } from '@/features/munti/tips';

type Pending = {
  content: string;
  source: ChatSource;
  focus: string | null;
  at: string;
  status: 'sending' | 'error';
  error?: string;
};

const EXAMPLES = ['ex1', 'ex2', 'ex3'] as const;

export default function MuntejChatScreen() {
  const { t } = useScreenT(NS);
  const { t: tg } = useTranslation();
  const { lang } = useDirection();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  // focus: opened from a task (Tasks list row / mic) → the chat is locked on that task
  const { mode, focus } = useLocalSearchParams<{ mode?: 'voice' | 'text'; focus?: string }>();

  const chat = useChat();
  const team = useTeam();
  const me = useMyProfile();
  const recorder = useVoiceRecorder();

  const [focusTaskId, setFocusTaskId] = useState<string | null>(typeof focus === 'string' && focus ? focus : null);
  // the same (modal) screen opened again for another task
  useEffect(() => {
    if (typeof focus === 'string' && focus) setFocusTaskId(focus);
  }, [focus]);

  const [text, setText] = useState('');
  // proposals the user turned down ("Not this one"), by message id
  const [rejected, setRejected] = useState<Record<string, true>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoiceState>('idle');
  // optimistic card states until the refetch confirms them
  const [ended, setEnded] = useState<Record<string, Exclude<CardState, 'active'>>>({});
  // the reply that just arrived: Munti talks on it (or celebrates a new task)
  const [freshId, setFreshId] = useState<string | null>(null);
  const markFresh = (rows: { id: string; role: string }[]) => {
    const reply = [...rows].reverse().find((r) => r.role === 'assistant');
    if (reply) setFreshId(reply.id);
  };

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
  // focusOverride: send about a task picked just now (state hasn't updated yet); default = the current focus
  const send = useCallback(
    async (raw: string, source: ChatSource, focusOverride?: string | null) => {
      const content = raw.trim();
      if (!content) return;
      setNotice(null);
      const f = focusOverride !== undefined ? focusOverride : focusTaskId;
      const p: Pending = { content, source, focus: f, at: new Date().toISOString(), status: 'sending' };
      setPending(p);
      try {
        const rows = await sendChat(content, source, f);
        appendToChat(qc, rows);
        markFresh(rows);
        setPending(null);
        qc.invalidateQueries({ queryKey: chatKey });
        if (rows.some((r) => r.action !== 'none')) invalidateTaskData(qc);
      } catch (e) {
        setPending({ ...p, status: 'error', error: (e as Error).message || t('failed') });
      }
    },
    [qc, t, focusTaskId],
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
    // nothing but room noise: don't send it (the speech model can invent words from silence)
    if (recorder.wasSilent()) {
      setVoice('idle');
      setNotice(tg('capture.noSpeech'));
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
      const msg = (e as Error).message;
      setNotice(msg === 'No speech detected' ? tg('capture.noSpeech') : msg || tg('capture.failed'));
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
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  // only the newest card per task is shown (it carries the latest state); proposals are always shown on their own message
  const latestCardFor = useMemo(() => {
    const m = new Map<string, string>();
    for (const msg of messages) {
      const snap = taskSnapshot(msg.payload);
      if (snap && !snap.confirm_update) m.set(snap.id, msg.id);
    }
    return m;
  }, [messages]);

  // a proposal counts as confirmed when a later assistant message updated that task
  const proposalState = (index: number, snap: TaskSnapshot, msgId: string): ProposalState => {
    if (rejected[msgId]) return 'rejected';
    const later = messages.slice(index + 1);
    if (later.some((x) => x.role === 'assistant' && x.action === 'updated' && (x.task_id ?? taskSnapshot(x.payload)?.id) === snap.id))
      return 'confirmed';
    return msgId === lastAssistantId && !pending ? 'open' : 'stale';
  };

  const confirmProposal = async (taskId: string, patch: NonNullable<TaskSnapshot['proposed_patch']>) => {
    try {
      const rows = await confirmChange(taskId, patch, lang);
      appendToChat(qc, rows);
      markFresh(rows);
      await Promise.all([qc.invalidateQueries({ queryKey: chatKey }), invalidateTaskData(qc)]);
    } catch {
      setNotice(t('confirmFailed'));
    }
  };

  // a team change counts as saved when the next assistant message is its "Done"
  const orgState = (index: number, msgId: string): OrgProposalState => {
    if (rejected[msgId]) return 'rejected';
    const next = messages.slice(index + 1).find((x) => x.role === 'assistant');
    if (next && orgDone(next.payload)) return 'done';
    return msgId === lastAssistantId && !pending ? 'open' : 'stale';
  };

  // errors are thrown back to the card, which shows them inline
  const confirmOrgChange = async (patch: OrgPatch) => {
    const rows = await confirmOrg(patch, lang);
    appendToChat(qc, rows);
    markFresh(rows);
    await Promise.all([qc.invalidateQueries({ queryKey: chatKey }), invalidateTeamData(qc), invalidateTaskData(qc)]);
  };

  // objective create/update/cancel/distribute proposals: saved only on Confirm, like team changes
  const objectiveState = (index: number, msgId: string): ObjectiveProposalState => {
    if (rejected[msgId]) return 'rejected';
    const next = messages.slice(index + 1).find((x) => x.role === 'assistant');
    if (next && objectiveDone(next.payload)) return 'done';
    return msgId === lastAssistantId && !pending ? 'open' : 'stale';
  };
  const confirmObjectiveChange = async (op: ObjectiveOp, id: string | null, patch: ObjectivePatch) => {
    const rows = await confirmObjective(op, id, patch, lang);
    appendToChat(qc, rows);
    markFresh(rows);
    await Promise.all([qc.invalidateQueries({ queryKey: chatKey }), invalidateObjectiveData(qc), invalidateTaskData(qc)]);
  };

  const focusComposer = () => setTimeout(() => input.current?.focus(), 50);

  const rejectProposal = (msgId: string) => {
    setRejected((r) => ({ ...r, [msgId]: true }));
    setText('');
    focusComposer();
  };

  const talkAbout = (taskId: string) => {
    setFocusTaskId(taskId);
    focusComposer();
  };

  // ── focus bar ──────────────────────────────────────────────────────────────
  const focusLive = focusTaskId ? liveTasks[focusTaskId] : undefined;
  // not in the chat yet (opened from the Tasks list) → read the task itself
  const focusDetail = useTask(focusTaskId && !focusLive ? focusTaskId : undefined);
  const focusTitle = focusLive?.title ?? focusDetail.data?.title ?? null;
  const focusOwnerId = focusLive ? focusLive.owner_id : (focusDetail.data?.owner_id ?? null);
  const focusOwnerProfile = focusOwnerId ? (team.data ?? []).find((p) => p.id === focusOwnerId) : undefined;
  const focusOwnerFull = focusOwnerProfile
    ? personName(focusOwnerProfile, lang)
    : focusDetail.data?.owner
      ? (lang === 'ar' && focusDetail.data.owner.full_name_ar) || focusDetail.data.owner.full_name
      : null;
  const focusOwner = focusOwnerFull ? focusOwnerFull.split(' ')[0] : null;

  // the focused task was deleted → leave focus
  const goneIds = chat.data?.gone;
  useEffect(() => {
    if (focusTaskId && goneIds?.includes(focusTaskId)) setFocusTaskId(null);
  }, [focusTaskId, goneIds]);

  const end = async (taskId: string, how: 'cancelled' | 'deleted') => {
    try {
      await (how === 'deleted' ? deleteTask(taskId) : cancelTask(taskId));
      setEnded((e) => ({ ...e, [taskId]: how }));
      await Promise.all([qc.invalidateQueries({ queryKey: chatKey }), invalidateTaskData(qc)]);
    } catch {
      setNotice(t(how === 'deleted' ? 'deleteFailed' : 'cancelFailed'));
    }
  };

  const fillMissing = (item: MissingItem) => {
    setText(t(`s_${item}`));
    focusComposer();
  };

  const firstName = me.data ? personName(me.data, lang).split(' ')[0] : '';
  const gone = new Set(chat.data?.gone ?? []);
  const meId = me.data?.id;
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
        <Pressable
          onPress={() => munti.sayKey('tip_chat')}
          accessibilityRole="button"
          accessibilityLabel={tg(`${MUNTI_NS}.name`)}
          accessibilityHint={tg(`${MUNTI_NS}.tip_chat`)}
          style={{ width: 56, height: 56 }}
        >
          <MuntejAvatar size="md" mood={busy ? 'think' : pending?.status === 'error' ? 'oops' : 'idle'} />
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
        </Pressable>
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

        {messages.map((m, i) => {
          if (m.role === 'user') return <UserBubble key={m.id} text={m.content} time={timeFmt(m.created_at)} />;
          const snap = taskSnapshot(m.payload);
          const org = orgProposal(m.payload);
          const obj = objectiveProposal(m.payload);
          const isLatest = m.id === lastAssistantId && !pending;
          let card = null;
          if (org) {
            card = (
              <OrgProposalCard
                key={`o-${m.id}`}
                proposal={org}
                state={orgState(i, m.id)}
                onConfirm={() => confirmOrgChange(org.patch)}
                onReject={() => rejectProposal(m.id)}
              />
            );
          } else if (obj) {
            card = (
              <ObjectiveProposalCard
                key={`ob-${m.id}`}
                proposal={obj}
                state={objectiveState(i, m.id)}
                onConfirm={() => confirmObjectiveChange(obj.op, obj.objective_id, obj.patch)}
                onReject={() => rejectProposal(m.id)}
              />
            );
          } else if (snap?.confirm_update) {
            const patch = snap.proposed_patch ?? {};
            card = (
              <ProposalCard
                key={`p-${m.id}`}
                snap={snap}
                team={team.data ?? []}
                state={proposalState(i, snap, m.id)}
                onConfirm={() => confirmProposal(snap.id, patch)}
                onReject={() => rejectProposal(m.id)}
              />
            );
          } else if (snap && latestCardFor.get(snap.id) === m.id) {
            const task = mergeTask(snap, liveTasks[snap.id]);
            const state: CardState =
              ended[task.id] ?? (gone.has(task.id) ? 'deleted' : task.status === 'cancelled' ? 'cancelled' : 'active');
            const owner = (team.data ?? []).find((p) => p.id === task.owner_id);
            const canDelete = !!meId && (task.assigner_id === meId || owner?.manager_id === meId);
            card = (
              <TaskCard
                key={`${task.id}-${m.id}`}
                task={task}
                action={m.action}
                team={team.data ?? []}
                state={state}
                canDelete={canDelete}
                askDelete={!!snap.confirm_delete && m.id === lastAssistantId}
                onCancel={() => end(task.id, 'cancelled')}
                onDelete={() => end(task.id, 'deleted')}
                onMissing={fillMissing}
                onTalkAbout={focusTaskId === task.id ? undefined : () => talkAbout(task.id)}
              />
            );
          }
          const next = isLatest ? (m.payload?.suggestions ?? []) : [];
          const candidates = isLatest && isCandidates(m.payload) ? m.payload : null;
          return (
            <View key={m.id} style={{ gap: spacing.md }}>
              <MuntejBubble
                time={timeFmt(m.created_at)}
                below={card}
                mood={m.id === freshId ? (m.action === 'created' ? 'celebrate' : 'talk') : undefined}
              >
                <MuntejText text={m.content} />
              </MuntejBubble>
              {candidates && (
                <Candidates
                  items={candidates.candidates}
                  disabled={busy}
                  onPick={(c) => {
                    setFocusTaskId(c.id);
                    send(candidates.original_message, 'text', c.id);
                  }}
                />
              )}
              <Suggestions items={next} onPick={(x) => send(x, 'text')} disabled={busy} />
            </View>
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
            onRetry={() => send(pending.content, pending.source, pending.focus)}
          />
        )}
        {notice && <NoticeBubble text={notice} />}
      </ScrollView>

      {!!focusTaskId && !!focusTitle && (
        <FocusBar
          title={focusTitle}
          ownerFirstName={focusOwner}
          onClear={() => {
            setFocusTaskId(null);
            // drop it from the route too, or a reload would lock onto the task again
            router.setParams({ focus: undefined });
          }}
        />
      )}

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

    </KeyboardAvoidingView>
  );
}
