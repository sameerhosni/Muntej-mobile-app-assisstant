// Screen 47 · Saree3's guided tour — no mockup; v2 light style per design/TOKENS.md
// A human-style onboarding, all conversation: Saree3 asks one thing at a time and reacts to every answer. You answer
// with a quick reply (right under his line, in the conversation) or in the one chat box at the bottom (type or talk),
// never a form. The header is one small row (Saree3, progress, "Later") so nothing covers the conversation; "Later"
// only pauses, the Home strip brings you back where you stopped.
//   owner  (signed up, owns a new account): hello → who (your name, then the company) → mic demo (the task card builds
//          itself, callouts explain each part) → your turn (type, talk or steal an idea; the SAME callouts point at your
//          real task, with a timer) → team (their name, email, what they do: one question each) → hand off a task →
//          graduation (confetti + what you did)
//   member (invited): hello → answer a practice check-in (fake notification, quick replies) → proof → graduation
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing, Calendar, Mic, Paperclip, Send, Square, User } from 'lucide-react-native';
import { AppText } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTasks, useTeam } from '@/lib/api';
import { Munti, type MuntiMood } from '@/features/munti/Munti';
import { contentDirection } from '@/features/chat/Bubbles';
import { confirmOrg, invalidateTaskData, sendChat, taskSnapshot, type TaskSnapshot } from '@/features/chat/api';
import { MicDeniedError, useVoiceRecorder } from '@/features/capture/useVoiceRecorder';
import { transcribeAudio } from '@/features/capture/api';
import { setCoachPaused } from '@/features/coach/api';
import { markOnboarding, setAccountName, setMyName, stepFrom, useOnboarding } from '@/features/onboarding/api';
import { TOUR_NS } from '@/features/onboarding/tourStrings';

type OwnerStep = 'hello' | 'who' | 'demo' | 'try' | 'team' | 'handoff' | 'grad';
type MemberStep = 'mhello' | 'mproof' | 'mgrad';
type Step = OwnerStep | MemberStep;
const OWNER: OwnerStep[] = ['hello', 'who', 'demo', 'try', 'team', 'handoff', 'grad'];
const MEMBER: MemberStep[] = ['mhello', 'mproof', 'mgrad'];

type Item =
  | { id: number; kind: 'say'; text: string }
  | { id: number; kind: 'me'; text: string }
  | { id: number; kind: 'mic' }
  | { id: number; kind: 'card'; card: CardData }
  | { id: number; kind: 'notif' }
  | { id: number; kind: 'grad'; lines: string[] }
  | { id: number; kind: 'busy'; text: string };
// an item before it gets its id (Omit spread over each kind of item)
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewItem = DistOmit<Item, 'id'>;
type CardData = {
  title: string;
  who: string;
  due: string | null;
  check: string | null;
  proof?: boolean;
  callouts: string[];
};
/** what Saree3 is waiting for: quick replies under his line and/or the chat box */
type Chip = { label: string; quiet?: boolean };
type Asking = { chips?: Chip[]; input?: { placeholder: string; email?: boolean; mic?: boolean } };
type Answer = { text: string; src: 'chip' | 'text' | 'voice'; chip?: number };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DOTS_MS = 450;
const typingMs = (s: string) => DOTS_MS + Math.min(2600, 250 + s.length * 22);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function WelcomeTour() {
  const { t } = useScreenT(TOUR_NS);
  const { lang } = useDirection();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useMyProfile();
  const row = useOnboarding(me.data?.id);
  const tasks = useTasks();
  const team = useTeam();
  const rec = useVoiceRecorder();

  const member = (row.data as { kind?: string } | null | undefined)?.kind === 'member';
  const steps: Step[] = member ? MEMBER : OWNER;
  const [step, setStep] = useState<Step | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [mood, setMood] = useState<MuntiMood>('wave');
  const [typing, setTyping] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);
  const answerTo = useRef<((a: Answer) => void) | null>(null);
  const seq = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const skipName = useRef(false);
  const stats = useRef({
    seconds: 0,
    mate: '' as string,
    mateDone: false,
    handed: false,
  });

  const push = (it: NewItem) => setItems((list) => [...list, { ...(it as Item), id: ++seq.current }]);
  const unbusy = () => setItems((list) => list.filter((x) => x.kind !== 'busy'));
  /** Saree3 types a line ("typing…" dots first), then the next thing happens */
  const say = async (text: string, m: MuntiMood = 'talk') => {
    setMood(m);
    setTyping(true);
    push({ kind: 'say', text });
    await wait(typingMs(text) + 250);
    setTyping(false);
  };
  /** Saree3 waits for your answer: a quick reply or the chat box. Your answer shows as your bubble. */
  const ask = (a: Asking) =>
    new Promise<Answer>((resolve) => {
      answerTo.current = resolve;
      setAsking(a);
    });
  const reply = (a: Answer) => {
    const resolve = answerTo.current;
    if (!resolve || !a.text.trim()) return;
    answerTo.current = null;
    setAsking(null);
    push({ kind: 'me', text: a.text.trim() });
    resolve({ ...a, text: a.text.trim() });
  };

  // where to start: from what's already done (owner) or the beginning (member)
  const ready = !!row.data && !!me.data && !!tasks.data && !!team.data;
  useEffect(() => {
    if (!ready || step) return;
    if (member) return setStep('mhello');
    const s = stepFrom(row.data!, me.data!, tasks.data ?? [], team.data ?? []);
    skipName.current = s === 'company';
    const map: Record<string, OwnerStep> = {
      name: 'hello',
      company: 'who',
      demo: 'demo',
      try: 'try',
      value: 'team',
      team: 'team',
      handoff: 'handoff',
      done: 'grad',
    };
    setStep(map[s] ?? 'hello');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // run each step's script once when it starts
  useEffect(() => {
    if (!step) return;
    run(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const later = () => {
    markOnboarding(qc, { dismissed: true }).catch(() => {});
    router.canGoBack() ? router.back() : router.replace('/');
  };
  const goHome = async () => {
    await markOnboarding(qc, { finished: true }).catch(() => {});
    await invalidateTaskData(qc);
    router.replace('/');
  };
  const firstName = (me.data ? (lang === 'ar' && me.data.full_name_ar) || me.data.full_name : '').split(' ')[0];
  const ideas = (): Chip[] => [t('idea1'), t('idea2'), t('idea3')].map((label) => ({ label, quiet: true }));

  // ─── the script ─────────────────────────────────────────────────────────────
  async function run(s: Step) {
    switch (s) {
      case 'hello': {
        await say(t('hi1'), 'wave');
        await say(t('hi2'), 'star');
        await say(t('hi3'), 'talk');
        const a = await ask({ chips: [{ label: t('hiYes') }, { label: t('hiWhat'), quiet: true }] });
        if (a.chip === 1) {
          await say(t('what1'), 'think');
          await say(t('what2'), 'star');
          await ask({ chips: [{ label: t('hiYes') }] });
        }
        return setStep('who');
      }
      case 'who': {
        if (!skipName.current) {
          await say(t('whoAskName'), 'wave');
          // a real name from sign-up (not just the email) is one tap away
          const known = me.data?.full_name ?? '';
          const a = await ask({
            chips: known && !/[@.]/.test(known) ? [{ label: known }] : undefined,
            input: { placeholder: t('whoName') },
          });
          setMyName(qc, me.data!.id, a.text).catch(() => {});
          await say(t('whoNameReact', { name: a.text.split(' ')[0] }), 'celebrate');
        }
        await say(t('whoAskCompany'), 'talk');
        const c = await ask({ input: { placeholder: t('whoCompany') } });
        setAccountName(qc, c.text).catch(() => {});
        await say(t('whoCompanyReact', { company: c.text }), 'star');
        return setStep('demo');
      }
      case 'demo': {
        await say(t('demo1'), 'think');
        push({ kind: 'mic' });
        await wait(3400);
        push({ kind: 'me', text: t('demoSay') });
        await say(t('demoBuild'), 'talk');
        push({
          kind: 'card',
          card: {
            title: t('demoSay'),
            who: t('callWho').split(':')[0],
            due: t('callDue').split(':')[0],
            check: null,
            proof: true,
            callouts: [t('callWho'), t('callDue'), t('callCheck'), t('callProof')],
          },
        });
        await wait(4 * 750 + 400);
        await say(t('demoEnd'), 'star');
        markOnboarding(qc, { demo_seen: true }).catch(() => {});
        await ask({ chips: [{ label: t('demoMine') }] });
        return setStep('try');
      }
      case 'try': {
        await say(t('try1'), 'talk');
        const startedAt = Date.now();
        for (;;) {
          const a = await ask({ chips: ideas(), input: { placeholder: t('tryPh'), mic: true } });
          const snap = await makeTask(a.text, a.src === 'voice' ? 'voice' : 'text');
          if (snap) {
            const c = cardFor(snap);
            push({ kind: 'card', card: c });
            await wait(c.callouts.length * 750 + 300);
            break;
          }
          await say(t('tryNoTask', { example: t('idea1') }), 'oops');
        }
        stats.current.seconds = Math.max(3, Math.round((Date.now() - startedAt) / 1000));
        await say(t('tryDone', { s: stats.current.seconds }), 'celebrate');
        await ask({ chips: [{ label: t('tryNext') }] });
        return setStep('team');
      }
      case 'team': {
        await say(t('team1'), 'talk');
        await say(t('teamAskName'), 'wave');
        const n = await ask({ chips: [{ label: t('teamSkip'), quiet: true }], input: { placeholder: t('teamName') } });
        if (n.chip === 0) return setStep('grad');
        const mate = n.text.split(' ')[0];
        await say(t('teamAskEmail', { name: mate }), 'talk');
        let email = '';
        for (;;) {
          email = (await ask({ input: { placeholder: t('teamEmail'), email: true } })).text.toLowerCase();
          if (EMAIL.test(email)) break;
          await say(t('teamBadEmail2'), 'oops');
        }
        await say(t('teamAskRole', { name: mate }), 'think');
        const roles = t('roles').split('|');
        const r = await ask({
          chips: [...roles.map((label) => ({ label, quiet: true })), { label: t('teamRoleSkip'), quiet: true }],
          input: { placeholder: t('teamRole') },
        });
        setMood('think');
        push({ kind: 'busy', text: '📩 …' });
        try {
          await confirmOrg(
            {
              full_name: n.text,
              email,
              title: r.chip === roles.length ? null : r.text,
              role: 'employee',
              manager_id: me.data!.id,
            } as never,
            lang === 'ar' ? 'ar' : 'en',
          );
          await qc.invalidateQueries({ queryKey: ['team'] });
        } catch {
          // the tour goes on; the team screen can retry the invite
        }
        unbusy();
        stats.current.mate = mate;
        stats.current.mateDone = true;
        await say(t('teamAdded', { name: mate }), 'celebrate');
        return setStep('handoff');
      }
      case 'handoff': {
        const mate = stats.current.mate || (team.data ?? []).find((p) => p.id !== me.data?.id)?.full_name?.split(' ')[0] || '';
        stats.current.mate = mate;
        await say(t('hand1', { name: mate }), 'talk');
        const a = await ask({
          chips: [{ label: t('handSuggest', { name: mate }), quiet: true }],
          input: { placeholder: t('tryPh'), mic: true },
        });
        const snap = await makeTask(a.text, a.src === 'voice' ? 'voice' : 'text');
        if (snap) {
          const c = cardFor(snap);
          push({ kind: 'card', card: c });
          await wait(c.callouts.length * 750 + 300);
          stats.current.handed = true;
        }
        await say(t('handDone', { name: mate }), 'star');
        return setStep('grad');
      }
      case 'grad': {
        setMood('celebrate');
        const following = (tasks.data ?? []).filter((x) => x.assigner_id === me.data?.id && !['done', 'cancelled'].includes(x.status)).length;
        push({
          kind: 'grad',
          lines: [
            ...(stats.current.seconds ? [t('gradTask', { s: stats.current.seconds })] : []),
            ...(stats.current.mateDone ? [t('gradTeam', { name: stats.current.mate })] : []),
            ...(stats.current.handed ? [t('gradHand')] : []),
            ...(following ? [t('gradFollow', { count: following, n: following })] : []),
          ],
        });
        await wait(1800);
        return keepTeaching();
      }
      // ─── member tour ───
      case 'mhello': {
        await say(t('m1', { name: firstName }), 'wave');
        await say(t('m2'), 'talk');
        push({ kind: 'notif' });
        const a = await ask({
          chips: [{ label: t('mDone') }, { label: t('mOnTrack'), quiet: true }, { label: t('mBlocked'), quiet: true }],
        });
        const react: [string, MuntiMood][] = [
          ['mDoneReact', 'celebrate'],
          ['mOnTrackReact', 'star'],
          ['mBlockedReact', 'think'],
        ];
        const [line, m] = react[a.chip ?? 0];
        await say(t(line), m);
        return setStep('mproof');
      }
      case 'mproof':
        await say(t('m3'), 'talk');
        await ask({ chips: [{ label: t('mGot') }] });
        return setStep('mgrad');
      case 'mgrad':
        await say(t('mGrad'), 'celebrate');
        return keepTeaching();
    }
  }

  /** after graduating: Saree3 keeps teaching on Home (one thing per app open), or takes a coffee break until
   *  you call him back from More */
  async function keepTeaching() {
    await say(t('keepAsk'), 'think');
    const a = await ask({ chips: [{ label: t('keepYes') }, { label: t('keepNo'), quiet: true }] });
    if (a.chip === 1) {
      setCoachPaused(qc, true).catch(() => {});
      await say(t('keepNoReact'), 'sleep');
    } else {
      await say(t('keepYesReact'), 'celebrate');
    }
    await ask({ chips: [{ label: t('gradHome') }] });
    return goHome();
  }

  /** the real task, through the real chat; the card + callouts point at what Muntej understood */
  async function makeTask(text: string, source: 'text' | 'voice'): Promise<TaskSnapshot | null> {
    setMood('think');
    push({ kind: 'busy', text: t('tryThinking') });
    try {
      const rows = await sendChat(text, source);
      unbusy();
      const made = rows.find((r) => r.role === 'assistant' && r.action === 'created');
      return made ? taskSnapshot(made.payload) : null;
    } catch {
      unbusy();
      return null;
    }
  }
  function cardFor(s: TaskSnapshot): CardData {
    const fmt = (iso: string) =>
      new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', {
        timeZone: 'Asia/Riyadh',
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(iso));
    const who = s.owner_name ?? firstName;
    const due = s.due_at ? fmt(s.due_at) : null;
    const check = s.next_check_at ? fmt(s.next_check_at) : null;
    return {
      title: s.title,
      who,
      due,
      check,
      callouts: [
        t('tryCallWho', { name: who }),
        due ? t('tryCallDue', { due }) : t('tryNoDue'),
        ...(check ? [t('tryCallCheck', { when: check })] : []),
      ],
    };
  }

  // ─── layout ─────────────────────────────────────────────────────────────────
  const idx = step ? steps.indexOf(step) : 0;
  const toEnd = () => scroll.current?.scrollToEnd({ animated: true });

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* one slim row: Saree3 (typing… / here with you), progress, Later */}
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingBottom: spacing.sm,
          paddingHorizontal: spacing.screen,
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Munti size="md" mood={mood} settleAfter={mood === 'talk' ? 2200 : undefined} />
          <View style={{ flex: 1 }}>
            <AppText weight="extrabold" style={{ fontSize: 17 }}>
              {t('me')}
            </AppText>
            <AppText variant="caption" weight="semibold" color={typing ? 'primary' : 'green'}>
              {typing ? t('typing') : `● ${t('here')}`}
            </AppText>
          </View>
          {step !== 'grad' && step !== 'mgrad' && (
            <Pressable
              onPress={later}
              accessibilityRole="button"
              hitSlop={10}
              style={{ minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: 8 }}
            >
              <AppText variant="small" color="textMuted">
                {t('later')}
              </AppText>
            </Pressable>
          )}
        </View>
        <Dots total={steps.length} at={idx} />
      </View>

      <ScrollView
        ref={scroll}
        onContentSizeChange={toEnd}
        onLayout={toEnd}
        contentContainerStyle={{ padding: spacing.screen, gap: spacing.md, paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        {!ready && <ActivityIndicator color={colors.primary} />}
        {items.map((it) =>
          it.kind === 'say' ? (
            <SayLine key={it.id} text={it.text} />
          ) : it.kind === 'me' ? (
            <MeLine key={it.id} text={it.text} />
          ) : it.kind === 'mic' ? (
            <MicDemo key={it.id} text={t('demoSay')} listening={t('demoListening')} />
          ) : it.kind === 'card' ? (
            <BuildCard key={it.id} card={it.card} />
          ) : it.kind === 'notif' ? (
            <FakeNotification key={it.id} title={t('mNotifTitle')} body={t('mNotifBody')} />
          ) : it.kind === 'grad' ? (
            <Graduation key={it.id} lines={it.lines} title={t('grad1')} footer={t('grad2')} />
          ) : (
            <View key={it.id} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <AppText color="textMuted">{it.text}</AppText>
            </View>
          ),
        )}
        {/* quick replies sit in the conversation, right under Saree3's question */}
        {!!asking?.chips && <QuickReplies chips={asking.chips} onPick={(c, i) => reply({ text: c.label, src: 'chip', chip: i })} />}
      </ScrollView>

      {/* the one chat box, only while Saree3 is waiting for a typed (or spoken) answer */}
      {!!asking?.input && (
        <ChatBar
          key={seq.current}
          t={t}
          rec={rec}
          placeholder={asking.input.placeholder}
          email={asking.input.email}
          mic={asking.input.mic}
          focus={!asking.chips}
          bottom={Math.max(insets.bottom, spacing.md)}
          onSend={(text, src) => reply({ text, src })}
        />
      )}
    </KeyboardAvoidingView>
  );
}

type T = (k: string, o?: Record<string, unknown>) => string;
type Recorder = ReturnType<typeof useVoiceRecorder>;

/** tappable answers, on your side of the conversation */
function QuickReplies({ chips, onPick }: { chips: Chip[]; onPick: (c: Chip, i: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm }}>
      {chips.map((c, i) => (
        <Pressable
          key={c.label}
          onPress={() => onPick(c, i)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            minHeight: sizes.touch,
            justifyContent: 'center',
            paddingHorizontal: spacing.lg,
            borderRadius: radius.pill,
            backgroundColor: c.quiet ? colors.surface : colors.primary,
            borderWidth: 1.5,
            borderColor: c.quiet ? colors.borderBlue : colors.primary,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <AppText weight="bold" color={c.quiet ? 'primary' : 'onDark'} style={{ writingDirection: contentDirection(c.label) }}>
            {c.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

/** the chat box: type, or tap the mic and talk (Saree3 writes it down and sends it) */
function ChatBar({
  t,
  rec,
  placeholder,
  email,
  mic,
  focus,
  bottom,
  onSend,
}: {
  t: T;
  rec: Recorder;
  placeholder: string;
  email?: boolean;
  mic?: boolean;
  focus?: boolean;
  bottom: number;
  onSend: (text: string, src: 'text' | 'voice') => void;
}) {
  const { isRTL } = useDirection();
  const [text, setText] = useState('');
  const [talking, setTalking] = useState<'idle' | 'rec' | 'writing'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const send = () => text.trim() && onSend(text.trim(), 'text');
  const talk = async () => {
    setErr(null);
    if (talking === 'idle') {
      try {
        await rec.start();
        setTalking('rec');
      } catch (e) {
        setErr(e instanceof MicDeniedError ? '🎤 ✗' : (e as Error).message);
      }
      return;
    }
    if (talking === 'rec') {
      const uri = await rec.stop();
      if (!uri) return setTalking('idle');
      setTalking('writing');
      try {
        const said = await transcribeAudio(uri);
        setTalking('idle');
        if (said.trim()) onSend(said.trim(), 'voice');
      } catch (e) {
        setTalking('idle');
        setErr((e as Error).message);
      }
    }
  };
  return (
    <View
      style={{
        paddingHorizontal: spacing.screen,
        paddingTop: spacing.sm,
        paddingBottom: bottom,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        gap: 4,
      }}
    >
      {!!err && (
        <AppText variant="small" color="red">
          {err}
        </AppText>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <TextInput
          value={talking === 'writing' ? t('tryWriting') : talking === 'rec' ? '' : text}
          onChangeText={setText}
          placeholder={talking === 'rec' ? `🔴 ${t('demoListening')}` : placeholder}
          placeholderTextColor={colors.textFaint}
          editable={talking === 'idle'}
          autoFocus={focus}
          multiline={!email}
          autoCapitalize={email ? 'none' : 'sentences'}
          autoCorrect={!email}
          keyboardType={email ? 'email-address' : 'default'}
          returnKeyType="send"
          submitBehavior={email ? 'submit' : 'blurAndSubmit'}
          onSubmitEditing={send}
          style={{
            flex: 1,
            minHeight: 48,
            maxHeight: 120,
            borderRadius: 24,
            borderWidth: 1.5,
            borderColor: colors.borderBlue,
            backgroundColor: colors.bg,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            color: colors.text,
            fontSize: 16,
            textAlign: email ? 'left' : isRTL ? 'right' : 'left',
            writingDirection: email ? 'ltr' : contentDirection(text),
          }}
        />
        {mic && (
          <RoundButton
            label={talking === 'rec' ? t('tryStop') : t('tryHold')}
            onPress={talk}
            bg={talking === 'rec' ? colors.red : colors.primaryTint}
          >
            {talking === 'writing' ? (
              <ActivityIndicator color={colors.primary} />
            ) : talking === 'rec' ? (
              <Square color={colors.onDark} size={18} fill={colors.onDark} />
            ) : (
              <Mic color={colors.primary} size={22} />
            )}
          </RoundButton>
        )}
        <RoundButton label={t('trySend')} onPress={send} bg={colors.primary} disabled={!text.trim() || talking !== 'idle'}>
          <Send color={colors.onDark} size={20} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </RoundButton>
      </View>
    </View>
  );
}

function RoundButton({
  label,
  onPress,
  bg,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  bg: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

// ─── building blocks ──────────────────────────────────────────────────────────

/** Saree3's line: "typing…" dots for a moment, then the words appear letter by letter */
function SayLine({ text }: { text: string }) {
  const [n, setN] = useState(-1);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      setN(0);
      id = setInterval(() => setN((v) => (v >= text.length ? v : v + 2)), 22);
    }, DOTS_MS);
    return () => {
      clearTimeout(start);
      clearInterval(id);
    };
  }, [text]);
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        maxWidth: '88%',
        backgroundColor: colors.surface,
        borderRadius: 20,
        borderBottomStartRadius: 6,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        boxShadow: shadows.card,
      }}
    >
      <AppText
        style={{
          fontSize: 17,
          lineHeight: 25,
          writingDirection: contentDirection(text),
        }}
      >
        {n < 0 ? '• • •' : text.slice(0, n)}
      </AppText>
    </View>
  );
}

function MeLine({ text }: { text: string }) {
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: '82%',
        backgroundColor: colors.primary,
        borderRadius: 20,
        borderBottomEndRadius: 6,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
      }}
    >
      <AppText weight="semibold" color="onDark" style={{ writingDirection: contentDirection(text) }}>
        {text}
      </AppText>
    </View>
  );
}

/** Saree3 "holds the mic": a live waveform while the words appear as if spoken */
function MicDemo({ text, listening }: { text: string; listening: string }) {
  const bars = useRef(Array.from({ length: 14 }, () => new Animated.Value(0.2))).current;
  const [n, setN] = useState(0);
  useEffect(() => {
    const loops = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, {
            toValue: 0.3 + Math.random() * 0.7,
            duration: 180 + i * 17,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(b, {
            toValue: 0.15,
            duration: 200 + i * 13,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    const words = text.split(' ');
    const id = setInterval(() => setN((v) => Math.min(words.length, v + 1)), Math.max(180, 2800 / words.length));
    const stop = setTimeout(() => loops.forEach((l) => l.stop()), 3200);
    return () => {
      loops.forEach((l) => l.stop());
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [bars, text]);
  return (
    <View
      style={{
        alignSelf: 'center',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.lg,
        borderRadius: radius.cardLg,
        backgroundColor: colors.primaryTint,
        width: '100%',
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: shadows.mic,
        }}
      >
        <Mic color={colors.onDark} size={30} />
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          height: 36,
        }}
      >
        {bars.map((b, i) => (
          <Animated.View
            key={i}
            style={{
              width: 4,
              borderRadius: 2,
              backgroundColor: colors.primary,
              height: b.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 36],
              }),
            }}
          />
        ))}
      </View>
      <AppText variant="caption" color="primary" weight="bold">
        {listening}
      </AppText>
      <AppText weight="bold" align="center" style={{ writingDirection: contentDirection(text) }}>
        {text.split(' ').slice(0, n).join(' ')}
      </AppText>
    </View>
  );
}

/** the task card builds itself; each callout lights up in turn */
function BuildCard({ card }: { card: CardData }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setShown((v) => Math.min(card.callouts.length, v + 1)), 750);
    return () => clearInterval(id);
  }, [card.callouts.length]);
  const pill = (on: boolean, icon: ReactNode, text: string | null, tint: ColorToken) =>
    text ? (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: radius.pill,
          backgroundColor: on ? colors[tint] : colors.chip,
          borderWidth: on ? 1.5 : 0,
          borderColor: colors.primary,
        }}
      >
        {icon}
        <AppText variant="caption" weight="bold" color={on ? 'primary' : 'textMuted'} style={{ writingDirection: contentDirection(text) }}>
          {text}
        </AppText>
      </View>
    ) : null;
  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.tile,
          borderWidth: 1,
          borderColor: colors.borderBlue,
          borderStartWidth: 4,
          borderStartColor: colors.primary,
          padding: spacing.lg,
          gap: spacing.sm,
          boxShadow: shadows.card,
        }}
      >
        <AppText
          weight="bold"
          style={{
            fontSize: 16,
            writingDirection: contentDirection(card.title),
          }}
        >
          {card.title}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {pill(shown >= 1, <User color={colors.primary} size={12} />, card.who, 'primaryTint')}
          {pill(shown >= 2, <Calendar color={colors.primary} size={12} />, card.due, 'primaryTint')}
          {pill(shown >= 3, <BellRing color={colors.primary} size={12} />, card.check, 'primaryTint')}
          {card.proof && pill(shown >= 4, <Paperclip color={colors.primary} size={12} />, '📎', 'primaryTint')}
        </View>
      </View>
      {card.callouts.slice(0, shown).map((c) => (
        <View
          key={c}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingStart: spacing.md,
          }}
        >
          <AppText color="primary" weight="extrabold">
            ↳
          </AppText>
          <AppText variant="small" weight="semibold" color="textSoft" style={{ flex: 1, writingDirection: contentDirection(c) }}>
            {c}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function FakeNotification({ title, body }: { title: string; body: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'center',
        padding: spacing.lg,
        borderRadius: radius.cardLg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        boxShadow: shadows.raised,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: colors.primaryTint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BellRing color={colors.primary} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText weight="bold">{title}</AppText>
        <AppText variant="small" color="textSoft" style={{ writingDirection: contentDirection(body) }}>
          {body}
        </AppText>
      </View>
    </View>
  );
}

function Graduation({ title, lines, footer }: { title: string; lines: string[]; footer: string }) {
  return (
    <View style={{ gap: spacing.md, alignItems: 'stretch' }}>
      <Confetti />
      <AppText variant="titleLg" align="center">
        {title}
      </AppText>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.cardLg,
          padding: spacing.lg,
          gap: spacing.sm,
          boxShadow: shadows.card,
        }}
      >
        {lines.map((l) => (
          <AppText key={l} weight="semibold" style={{ writingDirection: contentDirection(l) }}>
            {`✓ ${l}`}
          </AppText>
        ))}
      </View>
      <AppText color="textSoft" align="center">
        {footer}
      </AppText>
    </View>
  );
}

/** a little burst of emoji confetti */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        x: (i * 53) % 100,
        e: ['🎉', '✨', '🎊', '⭐', '💙'][i % 5],
        d: 900 + (i % 6) * 220,
      })),
    [],
  );
  const anims = useRef(pieces.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(
      60,
      anims.map((a, i) =>
        Animated.timing(a, {
          toValue: 1,
          duration: pieces[i].d,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [anims, pieces]);
  return (
    <View pointerEvents="none" style={{ height: 90 }}>
      {pieces.map((p, i) => (
        <Animated.Text
          key={i}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            fontSize: 20,
            opacity: anims[i].interpolate({
              inputRange: [0, 0.8, 1],
              outputRange: [0, 1, 0],
            }),
            transform: [
              {
                translateY: anims[i].interpolate({
                  inputRange: [0, 1],
                  outputRange: [-10, 80],
                }),
              },
              {
                rotate: anims[i].interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 200}deg`],
                }),
              },
            ],
          }}
        >
          {p.e}
        </Animated.Text>
      ))}
    </View>
  );
}

function Dots({ total, at }: { total: number; at: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: i === at ? 22 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i <= at ? colors.primary : colors.track,
          }}
        />
      ))}
    </View>
  );
}
