// Screen 47 · Saree3's guided tour — no mockup; v2 light style per design/TOKENS.md
// A human-style onboarding: a big Saree3 who talks (typed out), shows, then lets you do it with him watching.
// Answers are big buttons until it's your turn to do the real thing; "Later" (top corner) only pauses — the Home strip
// brings you back where you stopped.
//   owner  (signed up, owns a new account): hello → who (name + company) → mic demo (the task card builds itself,
//          callouts explain each part) → your turn (type or talk; the SAME callouts point at your real task, with a
//          timer) → team (3-field invite) → hand off a task → graduation (confetti + what you did)
//   member (invited): hello → answer a practice check-in (fake notification, 3 buttons) → proof → graduation
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
import { markOnboarding, setAccountName, setMyName, stepFrom, useOnboarding } from '@/features/onboarding/api';
import { TOUR_NS } from '@/features/onboarding/tourStrings';

type OwnerStep = 'hello' | 'who' | 'demo' | 'try' | 'team' | 'handoff' | 'grad';
type MemberStep = 'mhello' | 'mcheck' | 'mproof' | 'mgrad';
type Step = OwnerStep | MemberStep;
const OWNER: OwnerStep[] = ['hello', 'who', 'demo', 'try', 'team', 'handoff', 'grad'];
const MEMBER: MemberStep[] = ['mhello', 'mcheck', 'mproof', 'mgrad'];

type Item =
  | { id: number; kind: 'say'; text: string }
  | { id: number; kind: 'me'; text: string }
  | { id: number; kind: 'mic' }
  | { id: number; kind: 'card'; card: CardData }
  | { id: number; kind: 'notif' }
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const typingMs = (s: string) => Math.min(2600, 250 + s.length * 22);

export default function WelcomeTour() {
  const { t } = useScreenT(TOUR_NS);
  const { lang, isRTL } = useDirection();
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
  const [busy, setBusy] = useState(false);
  const [actions, setActions] = useState<ReactNode>(null);
  const seq = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const stats = useRef({
    seconds: 0,
    mate: '' as string,
    mateDone: false,
    handed: false,
  });

  const push = (it: NewItem) => setItems((list) => [...list, { ...(it as Item), id: ++seq.current }]);
  const unbusy = () => setItems((list) => list.filter((x) => x.kind !== 'busy'));
  /** Saree3 says a line (typed out), then the next thing happens */
  const say = async (text: string, m: MuntiMood = 'talk') => {
    setMood(m);
    push({ kind: 'say', text });
    await wait(typingMs(text) + 250);
  };

  // where to start: from what's already done (owner) or the beginning (member)
  const ready = !!row.data && !!me.data && !!tasks.data && !!team.data;
  useEffect(() => {
    if (!ready || step) return;
    if (member) return setStep('mhello');
    const s = stepFrom(row.data!, me.data!, tasks.data ?? [], team.data ?? []);
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
    setActions(null);
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

  // ─── the script ─────────────────────────────────────────────────────────────
  async function run(s: Step) {
    switch (s) {
      case 'hello': {
        await say(t('hi1'), 'wave');
        await say(t('hi2'), 'star');
        await say(t('hi3'), 'talk');
        setActions(
          <Row>
            <Big label={t('hiYes')} onPress={() => answer(t('hiYes'), () => setStep('who'))} />
            <Big label={t('hiWhat')} quiet onPress={() => answer(t('hiWhat'), whatDo)} />
          </Row>,
        );
        return;
      }
      case 'who':
        await say(t('who1'), 'celebrate');
        setActions(<WhoForm t={t} defaultName={/[@.]/.test(me.data?.full_name ?? '') ? '' : (me.data?.full_name ?? '')} onDone={whoDone} />);
        return;
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
        setActions(<Big label={t('demoMine')} onPress={() => answer(t('demoMine'), () => setStep('try'))} />);
        return;
      }
      case 'try':
        await say(t('try1'), 'talk');
        setActions(<TryBox t={t} rec={rec} ideas={[t('idea1'), t('idea2'), t('idea3')]} onSend={(text, src) => tryTask(text, src)} />);
        return;
      case 'team':
        await say(t('team1'), 'talk');
        setActions(<TeamForm t={t} onAdd={teamAdd} onSkip={() => answer(t('teamSkip'), () => setStep('grad'))} />);
        return;
      case 'handoff': {
        const mate = stats.current.mate || (team.data ?? []).find((p) => p.id !== me.data?.id)?.full_name?.split(' ')[0] || '';
        stats.current.mate = mate;
        await say(t('hand1', { name: mate }), 'talk');
        setActions(
          <TryBox t={t} rec={rec} initial={t('handSuggest', { name: mate })} sendLabel={t('handSend')} onSend={(text, src) => handTask(text, src)} />,
        );
        return;
      }
      case 'grad':
        setMood('celebrate');
        setActions(null);
        return;
      // ─── member tour ───
      case 'mhello':
        await say(t('m1', { name: firstName }), 'wave');
        await say(t('m2'), 'talk');
        push({ kind: 'notif' });
        setActions(
          <Row>
            <Big
              label={t('mDone')}
              onPress={() =>
                answer(t('mDone'), async () => {
                  await say(t('mDoneReact'), 'celebrate');
                  setStep('mproof');
                })
              }
            />
            <Big
              label={t('mOnTrack')}
              quiet
              onPress={() =>
                answer(t('mOnTrack'), async () => {
                  await say(t('mOnTrackReact'), 'star');
                  setStep('mproof');
                })
              }
            />
            <Big
              label={t('mBlocked')}
              quiet
              onPress={() =>
                answer(t('mBlocked'), async () => {
                  await say(t('mBlockedReact'), 'think');
                  setStep('mproof');
                })
              }
            />
          </Row>,
        );
        return;
      case 'mproof':
        await say(t('m3'), 'talk');
        setActions(<Big label={t('mGot')} onPress={() => answer(t('mGot'), () => setStep('mgrad'))} />);
        return;
      case 'mgrad':
        await say(t('mGrad'), 'celebrate');
        setActions(<Big label={t('gradHome')} onPress={goHome} />);
        return;
    }
  }

  /** the user's choice shows as their bubble, then the next thing */
  function answer(text: string, then: () => void | Promise<void>) {
    setActions(null);
    push({ kind: 'me', text });
    then();
  }
  async function whatDo() {
    await say(t('what1'), 'think');
    await say(t('what2'), 'star');
    setActions(<Big label={t('hiYes')} onPress={() => answer(t('hiYes'), () => setStep('who'))} />);
  }
  async function whoDone(name: string, company: string) {
    setActions(null);
    push({ kind: 'me', text: `${name} · ${company}` });
    try {
      await setMyName(qc, me.data!.id, name);
      await setAccountName(qc, company);
    } catch {
      // the tour goes on; the names can be fixed in Settings
    }
    await say(t('whoHi', { name: name.split(' ')[0], company }), 'celebrate');
    setStep('demo');
  }

  /** your turn: the real task, through the real chat; the card + callouts point at what Muntej understood */
  async function makeTask(text: string, source: 'text' | 'voice'): Promise<TaskSnapshot | null> {
    setActions(null);
    push({ kind: 'me', text });
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
  async function tryTask(text: string, source: 'text' | 'voice', startedAt = Date.now()) {
    const snap = await makeTask(text, source);
    if (!snap) {
      await say(t('tryNoTask', { example: t('idea1') }), 'oops');
      setActions(<TryBox t={t} rec={rec} ideas={[t('idea1'), t('idea2'), t('idea3')]} onSend={(x, src) => tryTask(x, src, startedAt)} />);
      return;
    }
    const c = cardFor(snap);
    push({ kind: 'card', card: c });
    await wait(c.callouts.length * 750 + 300);
    stats.current.seconds = Math.max(3, Math.round((Date.now() - startedAt) / 1000));
    await say(t('tryDone', { s: stats.current.seconds }), 'celebrate');
    setActions(<Big label={t('tryNext')} onPress={() => answer(t('tryNext'), () => setStep('team'))} />);
  }
  async function teamAdd(name: string, email: string, role: string) {
    setActions(null);
    push({ kind: 'me', text: `${name} · ${email}` });
    setBusy(true);
    try {
      await confirmOrg(
        {
          full_name: name,
          email,
          title: role || null,
          role: 'employee',
          manager_id: me.data!.id,
        } as never,
        lang === 'ar' ? 'ar' : 'en',
      );
      await qc.invalidateQueries({ queryKey: ['team'] });
    } catch {
      // shown below as the normal line; the team screen can retry
    } finally {
      setBusy(false);
    }
    stats.current.mate = name.split(' ')[0];
    stats.current.mateDone = true;
    await say(t('teamAdded', { name: stats.current.mate }), 'celebrate');
    setStep('handoff');
  }
  async function handTask(text: string, source: 'text' | 'voice') {
    const snap = await makeTask(text, source);
    if (snap) {
      const c = cardFor(snap);
      push({ kind: 'card', card: c });
      await wait(c.callouts.length * 750 + 300);
      stats.current.handed = true;
    }
    await say(t('handDone', { name: stats.current.mate }), 'star');
    setStep('grad');
  }

  // ─── layout ─────────────────────────────────────────────────────────────────
  const idx = step ? steps.indexOf(step) : 0;
  const following = (tasks.data ?? []).filter((x) => x.assigner_id === me.data?.id && !['done', 'cancelled'].includes(x.status)).length;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* big Saree3 + progress + Later */}
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.screen,
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderBottomStartRadius: 28,
          borderBottomEndRadius: 28,
          boxShadow: shadows.card,
          paddingBottom: spacing.lg,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignSelf: 'stretch',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Dots total={steps.length} at={idx} />
          {step !== 'grad' && step !== 'mgrad' && (
            <Pressable
              onPress={later}
              accessibilityRole="button"
              hitSlop={10}
              style={{
                minHeight: 36,
                justifyContent: 'center',
                paddingHorizontal: 8,
              }}
            >
              <AppText variant="small" color="textMuted">
                {t('later')}
              </AppText>
            </Pressable>
          )}
        </View>
        <Munti size="lg" mood={mood} settleAfter={mood === 'talk' ? 2200 : undefined} />
      </View>

      <ScrollView
        ref={scroll}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{
          padding: spacing.screen,
          gap: spacing.md,
          paddingBottom: spacing.xxl,
        }}
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
          ) : (
            <View
              key={it.id}
              style={{
                flexDirection: 'row',
                gap: spacing.sm,
                alignItems: 'center',
              }}
            >
              <ActivityIndicator size="small" color={colors.primary} />
              <AppText color="textMuted">{it.text}</AppText>
            </View>
          ),
        )}
        {step === 'grad' && (
          <Graduation
            lines={[
              ...(stats.current.seconds ? [t('gradTask', { s: stats.current.seconds })] : []),
              ...(stats.current.mateDone ? [t('gradTeam', { name: stats.current.mate })] : []),
              ...(stats.current.handed ? [t('gradHand')] : []),
              ...(following ? [t('gradFollow', { count: following, n: following })] : []),
            ]}
            title={t('grad1')}
            footer={t('grad2')}
            home={t('gradHome')}
            onHome={goHome}
          />
        )}
      </ScrollView>

      {/* what you can do now */}
      {(!!actions || busy) && (
        <View
          style={{
            paddingHorizontal: spacing.screen,
            paddingTop: spacing.md,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            backgroundColor: colors.bg,
            gap: spacing.sm,
          }}
        >
          {busy ? <ActivityIndicator color={colors.primary} /> : actions}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

type T = (k: string, o?: Record<string, unknown>) => string;
type Recorder = ReturnType<typeof useVoiceRecorder>;

/** your turn: type, tap an idea, or talk (Saree3 writes it down) */
function TryBox({
  t,
  rec,
  ideas,
  initial,
  sendLabel,
  onSend,
}: {
  t: T;
  rec: Recorder;
  ideas?: string[];
  initial?: string;
  sendLabel?: string;
  onSend: (text: string, src: 'text' | 'voice') => void;
}) {
  const { isRTL } = useDirection();
  const [text, setText] = useState(initial ?? '');
  const [talking, setTalking] = useState<'idle' | 'rec' | 'writing'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const mic = async () => {
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
    <View style={{ gap: spacing.sm }}>
      {!!ideas && (
        <>
          <AppText variant="caption" color="textMuted">
            {t('tryStuck')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {ideas.map((x) => (
              <Pressable
                key={x}
                onPress={() => setText(x)}
                style={({ pressed }) => ({
                  paddingHorizontal: 14,
                  minHeight: 40,
                  justifyContent: 'center',
                  borderRadius: radius.pill,
                  backgroundColor: colors.purpleTint,
                  borderWidth: 1,
                  borderColor: colors.purpleBorder,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <AppText variant="small" weight="bold" color="purpleText">
                  {x}
                </AppText>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <TextInput
          value={talking === 'writing' ? t('tryWriting') : talking === 'rec' ? '' : text}
          onChangeText={setText}
          placeholder={talking === 'rec' ? '🔴 …' : t('tryPh')}
          placeholderTextColor={colors.textFaint}
          editable={talking === 'idle'}
          multiline
          style={{
            flex: 1,
            minHeight: 52,
            maxHeight: 120,
            borderRadius: 26,
            borderWidth: 2,
            borderColor: colors.primary,
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            color: colors.text,
            textAlign: isRTL ? 'right' : 'left',
            writingDirection: contentDirection(text),
          }}
        />
        <Pressable
          onPress={mic}
          accessibilityRole="button"
          accessibilityLabel={talking === 'rec' ? t('tryStop') : t('tryHold')}
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: talking === 'rec' ? colors.red : colors.primaryTint,
          }}
        >
          {talking === 'writing' ? (
            <ActivityIndicator color={colors.primary} />
          ) : talking === 'rec' ? (
            <Square color={colors.onDark} size={20} fill={colors.onDark} />
          ) : (
            <Mic color={colors.primary} size={24} />
          )}
        </Pressable>
      </View>
      {!!err && (
        <AppText variant="small" color="red">
          {err}
        </AppText>
      )}
      <Big
        label={sendLabel ?? t('trySend')}
        disabled={!text.trim() || talking !== 'idle'}
        onPress={() => onSend(text.trim(), 'text')}
        icon={<Send color={colors.onDark} size={18} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />}
      />
    </View>
  );
}

function WhoForm({ t, defaultName, onDone }: { t: T; defaultName: string; onDone: (name: string, company: string) => void }) {
  const [name, setName] = useState(defaultName);
  const [company, setCompany] = useState('');
  return (
    <View style={{ gap: spacing.sm }}>
      <Field value={name} onChange={setName} placeholder={t('whoName')} />
      <Field value={company} onChange={setCompany} placeholder={t('whoCompany')} />
      <Big label={t('whoGo')} disabled={!name.trim() || !company.trim()} onPress={() => onDone(name.trim(), company.trim())} />
    </View>
  );
}

function TeamForm({ t, onAdd, onSkip }: { t: T; onAdd: (name: string, email: string, role: string) => void; onSkip: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const okEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  return (
    <View style={{ gap: spacing.sm }}>
      <Field value={name} onChange={setName} placeholder={t('teamName')} />
      <Field value={email} onChange={setEmail} placeholder={t('teamEmail')} email />
      {!!email && !okEmail && (
        <AppText variant="caption" color="red">
          {t('teamBadEmail')}
        </AppText>
      )}
      <Field value={role} onChange={setRole} placeholder={t('teamRole')} />
      <Big label={t('teamAdd')} disabled={!name.trim() || !okEmail} onPress={() => onAdd(name.trim(), email.trim().toLowerCase(), role.trim())} />
      <Big label={t('teamSkip')} quiet onPress={onSkip} />
    </View>
  );
}

// ─── building blocks ──────────────────────────────────────────────────────────

/** Saree3's line, typed out letter by letter */
function SayLine({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((v) => (v >= text.length ? v : v + 2)), 22);
    return () => clearInterval(id);
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
        {text.slice(0, n)}
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

function Graduation({ title, lines, footer, home, onHome }: { title: string; lines: string[]; footer: string; home: string; onHome: () => void }) {
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
      <Big label={home} onPress={onHome} />
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

function Row({ children }: { children: ReactNode }) {
  return <View style={{ gap: spacing.sm }}>{children}</View>;
}

function Big({
  label,
  onPress,
  quiet,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  quiet?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: sizes.touch + 10,
        borderRadius: radius.pill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: spacing.xl,
        backgroundColor: quiet ? colors.surface : colors.primary,
        borderWidth: quiet ? 1.5 : 0,
        borderColor: colors.borderBlue,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      })}
    >
      {icon}
      <AppText weight="extrabold" style={{ fontSize: 17 }} color={quiet ? 'primary' : 'onDark'}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Field({ value, onChange, placeholder, email }: { value: string; onChange: (v: string) => void; placeholder: string; email?: boolean }) {
  const { isRTL } = useDirection();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      autoCapitalize={email ? 'none' : 'words'}
      autoCorrect={!email}
      keyboardType={email ? 'email-address' : 'default'}
      style={{
        minHeight: 52,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: colors.borderBlue,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.lg,
        color: colors.text,
        fontSize: 16,
        textAlign: email ? 'left' : isRTL ? 'right' : 'left',
      }}
    />
  );
}
