// Screen 47 · Saree3's onboarding — no mockup; v2 light style per design/TOKENS.md
// Short and clear, not a chat: 3 value screens (one headline, one line, one example each), then you try it.
//   owner  (signed up, owns a new account): Say it once → Muntej follows up for you → You only see the decisions →
//          Try it now (type / talk / tap an example; your real first task appears as a card) → Invite your team (email)
//   member (invited): Work comes to you clear → Reply in one tap (a practice check-in) → Your manager sees your progress
// "Skip" (top) pauses it: the Home strip brings it back. Finishing goes Home, where each screen teaches itself once
// (src/features/coach/ScreenTip.tsx).
import { useState, type ComponentType, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing, Calendar, ClipboardCheck, Gavel, Hand, Mic, Send, Square, TrendingUp, User, Users, type LucideProps } from 'lucide-react-native';
import { AppText, Button } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { Munti, type MuntiMood } from '@/features/munti/Munti';
import { contentDirection } from '@/features/chat/Bubbles';
import { invalidateTaskData, sendChat, taskSnapshot, type TaskSnapshot } from '@/features/chat/api';
import { MicDeniedError, useVoiceRecorder } from '@/features/capture/useVoiceRecorder';
import { transcribeAudio } from '@/features/capture/api';
import { useUpsertPerson } from '@/features/org/model';
import { nameFromEmail } from '@/features/invite/api';
import { markOnboarding, useOnboarding } from '@/features/onboarding/api';
import { TOUR_NS } from '@/features/onboarding/tourStrings';

type Slide = { key: string; Icon: ComponentType<LucideProps>; mood: MuntiMood; example?: boolean };
const OWNER: Slide[] = [
  { key: 'v1', Icon: Mic, mood: 'wave', example: true },
  { key: 'v2', Icon: BellRing, mood: 'talk', example: true },
  { key: 'v3', Icon: Gavel, mood: 'star', example: true },
];
const MEMBER: Slide[] = [
  { key: 'm1', Icon: ClipboardCheck, mood: 'wave' },
  { key: 'm2', Icon: Hand, mood: 'talk' },
  { key: 'm3', Icon: TrendingUp, mood: 'celebrate' },
];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function Welcome() {
  const { t } = useScreenT(TOUR_NS);
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useMyProfile();
  const row = useOnboarding(me.data?.id);
  const member = (row.data as { kind?: string } | null | undefined)?.kind === 'member';
  // owner: 3 slides + try + team; member: 3 slides (the 2nd has the practice check-in)
  const pages = member ? MEMBER.length : OWNER.length + 2;
  const [page, setPage] = useState(0);

  const skip = () => {
    markOnboarding(qc, { dismissed: true }).catch(() => {});
    router.canGoBack() ? router.back() : router.replace('/');
  };
  const finish = async () => {
    await markOnboarding(qc, { demo_seen: true, finished: true }).catch(() => {});
    await invalidateTaskData(qc);
    router.replace('/');
  };
  const next = () => (page + 1 >= pages ? finish() : setPage(page + 1));

  const slides = member ? MEMBER : OWNER;
  const slide = page < slides.length ? slides[page] : null;
  const last = page + 1 >= pages;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* progress + Skip */}
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.screen,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: sizes.touch + insets.top,
        }}
      >
        <Dots total={pages} at={page} />
        {!last && (
          <Pressable
            onPress={skip}
            accessibilityRole="button"
            hitSlop={10}
            style={{ minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: 8 }}
          >
            <AppText variant="small" weight="semibold" color="textMuted">
              {t('skip')}
            </AppText>
          </Pressable>
        )}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, padding: spacing.screen, gap: spacing.xl, justifyContent: 'center' }}
      >
        {slide ? (
          <SlideView slide={slide} t={t} />
        ) : page === OWNER.length ? (
          <TryIt t={t} onDone={next} />
        ) : (
          <InviteTeam t={t} meId={me.data?.id ?? null} />
        )}
      </ScrollView>

      {/* the try step has its own buttons (it moves on by itself after the first task) */}
      {!(page === OWNER.length && !member) && (
        <View style={{ paddingHorizontal: spacing.screen, paddingBottom: Math.max(insets.bottom, spacing.lg), paddingTop: spacing.sm }}>
          <Button label={last ? t('start') : t('next')} onPress={next} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

type T = (k: string, o?: Record<string, unknown>) => string;

/** one value: a big picture, one headline, one line, one example (or the practice check-in for members) */
function SlideView({ slide, t }: { slide: Slide; t: T }) {
  return (
    <View style={{ alignItems: 'center', gap: spacing.lg }}>
      <View
        style={{
          width: 132,
          height: 132,
          borderRadius: 66,
          backgroundColor: colors.primaryTint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <slide.Icon color={colors.primary} size={56} strokeWidth={1.8} />
        <View style={{ position: 'absolute', bottom: -6, end: -10 }}>
          <Munti size="md" mood={slide.mood} />
        </View>
      </View>
      <AppText variant="titleLg" align="center">
        {t(`${slide.key}Title`)}
      </AppText>
      <AppText align="center" color="textSoft" style={{ fontSize: 17, lineHeight: 26 }}>
        {t(`${slide.key}Body`)}
      </AppText>
      {slide.example && (
        <View
          style={{ alignSelf: 'stretch', padding: spacing.lg, borderRadius: radius.cardLg, backgroundColor: colors.surface, boxShadow: shadows.card }}
        >
          <AppText weight="bold" align="center" color="primary" style={{ writingDirection: contentDirection(t(`${slide.key}Example`)) }}>
            {t(`${slide.key}Example`)}
          </AppText>
        </View>
      )}
      {slide.key === 'm2' && <PracticeCheckIn t={t} />}
    </View>
  );
}

/** members: a pretend check-in notification, answered in one tap */
function PracticeCheckIn({ t }: { t: T }) {
  const [picked, setPicked] = useState<string | null>(null);
  const options: [string, string][] = [
    ['mDone', 'mDoneReact'],
    ['mOnTrack', 'mOnTrackReact'],
    ['mBlocked', 'mBlockedReact'],
  ];
  return (
    <View style={{ alignSelf: 'stretch', gap: spacing.md }}>
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
          style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' }}
        >
          <BellRing color={colors.primary} size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText weight="bold">{t('mNotifTitle')}</AppText>
          <AppText variant="small" color="textSoft">
            {t('mNotifBody')}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {options.map(([k]) => (
          <Pressable
            key={k}
            onPress={() => setPicked(k)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flex: 1,
              minHeight: sizes.touch,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: picked === k ? colors.primary : colors.surface,
              borderWidth: 1.5,
              borderColor: picked === k ? colors.primary : colors.borderBlue,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <AppText weight="bold" color={picked === k ? 'onDark' : 'primary'}>
              {t(k)}
            </AppText>
          </Pressable>
        ))}
      </View>
      {!!picked && (
        <AppText align="center" weight="semibold" color="green">
          {t(options.find(([k]) => k === picked)![1])}
        </AppText>
      )}
    </View>
  );
}

/** owners: their real first task, typed, spoken or an example; then the card shows what Muntej understood */
function TryIt({ t, onDone }: { t: T; onDone: () => void }) {
  const { lang, isRTL } = useDirection();
  const rec = useVoiceRecorder();
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'rec' | 'writing' | 'thinking'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<TaskSnapshot | null>(null);

  const send = async (said: string, source: 'text' | 'voice') => {
    if (!said.trim()) return;
    setErr(null);
    setState('thinking');
    try {
      const rows = await sendChat(said.trim(), source);
      const row = rows.find((r) => r.role === 'assistant' && r.action === 'created');
      const snap = row ? taskSnapshot(row.payload) : null;
      if (snap) setMade(snap);
      else setErr(t('tryNoTask'));
    } catch {
      setErr(t('tryNoTask'));
    } finally {
      setState('idle');
    }
  };
  const talk = async () => {
    setErr(null);
    if (state === 'idle') {
      try {
        await rec.start();
        setState('rec');
      } catch (e) {
        setErr(e instanceof MicDeniedError ? '🎤 ✗' : (e as Error).message);
      }
      return;
    }
    if (state === 'rec') {
      const uri = await rec.stop();
      if (!uri) return setState('idle');
      setState('writing');
      try {
        const said = await transcribeAudio(uri);
        setText(said);
        await send(said, 'voice');
      } catch (e) {
        setState('idle');
        setErr((e as Error).message);
      }
    }
  };
  const when = (iso: string | null | undefined) =>
    iso
      ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', {
          timeZone: 'Asia/Riyadh',
          weekday: 'long',
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(iso))
      : null;

  if (made)
    return (
      <View style={{ gap: spacing.lg }}>
        <View style={{ alignItems: 'center' }}>
          <Munti size="lg" mood="celebrate" />
        </View>
        <AppText variant="titleLg" align="center">
          {t('doneTitle')}
        </AppText>
        <View
          style={{
            padding: spacing.lg,
            gap: spacing.sm,
            borderRadius: radius.tile,
            backgroundColor: colors.surface,
            borderStartWidth: 4,
            borderStartColor: colors.primary,
            boxShadow: shadows.card,
          }}
        >
          <AppText weight="bold" style={{ fontSize: 17, writingDirection: contentDirection(made.title) }}>
            {made.title}
          </AppText>
          <Fact icon={<User color={colors.primary} size={16} />} label={t('who')} value={made.owner_name ?? '—'} />
          <Fact icon={<Calendar color={colors.primary} size={16} />} label={t('due')} value={when(made.due_at) ?? t('noDue')} />
          {!!made.next_check_at && <Fact icon={<BellRing color={colors.primary} size={16} />} label={t('check')} value={when(made.next_check_at)!} />}
        </View>
        <AppText align="center" color="textSoft">
          {t('doneBody')}
        </AppText>
        <Button label={t('next')} onPress={onDone} />
      </View>
    );

  const busy = state === 'thinking' || state === 'writing';
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ alignItems: 'center' }}>
        <Munti size="lg" mood={busy ? 'think' : 'talk'} />
      </View>
      <AppText variant="titleLg" align="center">
        {t('tryTitle')}
      </AppText>
      <AppText align="center" color="textSoft">
        {t('tryBody')}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' }}>
        {[t('idea1'), t('idea2'), t('idea3')].map((x) => (
          <Pressable
            key={x}
            onPress={() => setText(x)}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => ({
              minHeight: 40,
              paddingHorizontal: 14,
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <TextInput
          value={state === 'writing' ? t('tryWriting') : state === 'rec' ? '' : text}
          onChangeText={setText}
          placeholder={state === 'rec' ? `🔴 ${t('tryStop')}` : t('tryPh')}
          placeholderTextColor={colors.textFaint}
          editable={state === 'idle'}
          multiline
          style={{
            flex: 1,
            minHeight: 52,
            maxHeight: 120,
            borderRadius: 26,
            borderWidth: 1.5,
            borderColor: colors.borderBlue,
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            color: colors.text,
            fontSize: 16,
            textAlign: isRTL ? 'right' : 'left',
            writingDirection: contentDirection(text),
          }}
        />
        <Round
          label={state === 'rec' ? t('tryStop') : t('tryTalk')}
          bg={state === 'rec' ? colors.red : colors.primaryTint}
          onPress={talk}
          disabled={busy}
        >
          {state === 'rec' ? <Square color={colors.onDark} size={18} fill={colors.onDark} /> : <Mic color={colors.primary} size={22} />}
        </Round>
        <Round label={t('trySend')} bg={colors.primary} onPress={() => send(text, 'text')} disabled={!text.trim() || state !== 'idle'}>
          {busy ? (
            <ActivityIndicator color={colors.onDark} />
          ) : (
            <Send color={colors.onDark} size={20} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          )}
        </Round>
      </View>
      {state === 'thinking' && (
        <AppText align="center" color="textMuted">
          {t('tryThinking')}
        </AppText>
      )}
      {!!err && (
        <AppText align="center" color="red">
          {err}
        </AppText>
      )}
      <Pressable onPress={onDone} accessibilityRole="button" style={{ minHeight: sizes.touch, alignItems: 'center', justifyContent: 'center' }}>
        <AppText weight="semibold" color="textMuted">
          {t('tryLater')}
        </AppText>
      </Pressable>
    </View>
  );
}

/** owners: invite people by email (they sign in with it and land in this team) */
function InviteTeam({ t, meId }: { t: T; meId: string | null }) {
  const upsert = useUpsertPerson();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  const ok = EMAIL.test(email.trim());
  const invite = async () => {
    const e = email.trim().toLowerCase();
    try {
      await upsert.mutateAsync({ full_name: nameFromEmail(e), email: e, role: 'employee', manager_id: meId });
      setSent((s) => [e, ...s]);
      setEmail('');
    } catch {
      // already in the team or not allowed: nothing to add here; the Team screen explains
    }
  };
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ alignItems: 'center' }}>
        <View
          style={{ width: 132, height: 132, borderRadius: 66, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' }}
        >
          <Users color={colors.primary} size={56} strokeWidth={1.8} />
        </View>
      </View>
      <AppText variant="titleLg" align="center">
        {t('teamTitle')}
      </AppText>
      <AppText align="center" color="textSoft">
        {t('teamBody')}
      </AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="name@company.sa"
          placeholderTextColor={colors.textFaint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => ok && invite()}
          style={{
            flex: 1,
            minHeight: sizes.touch,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: colors.borderBlue,
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.md,
            color: colors.text,
            fontSize: 16,
            textAlign: 'left',
            writingDirection: 'ltr',
          }}
        />
        <Button label={t('teamInvite')} size="md" loading={upsert.isPending} disabled={!ok} onPress={invite} />
      </View>
      {sent.map((e) => (
        <AppText key={e} weight="semibold" color="green" align="center">
          {t('teamSent', { email: e })}
        </AppText>
      ))}
    </View>
  );
}

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      {icon}
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
      <AppText variant="small" weight="bold" style={{ flex: 1, writingDirection: contentDirection(value) }}>
        {value}
      </AppText>
    </View>
  );
}

function Round({
  label,
  bg,
  onPress,
  disabled,
  children,
}: {
  label: string;
  bg: string;
  onPress: () => void;
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
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

function Dots({ total, at }: { total: number; at: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ width: i === at ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i <= at ? colors.primary : colors.track }} />
      ))}
    </View>
  );
}
