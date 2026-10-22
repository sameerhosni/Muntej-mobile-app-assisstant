// Saree3 teaches in the real chat, one step at a time (only for someone who signed up and owns a new account):
//   name → company → demo (Saree3 types a task into the box itself, "sends" it, and a sample card appears with what
//   Muntej understood — nothing is saved) → your turn (the box glows) → the value ("done in 9 seconds") → add your
//   team → hand a task off → done. Each step can be skipped; the Home strip brings them back.
// The coach's bubbles are local (not chat history). Answers to "what should I call you / your company?" are caught
// here instead of going to the AI. Everything else the user types goes to Muntej as usual — that IS the lesson.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing, Calendar, CircleCheck } from 'lucide-react-native';
import { AppText, Avatar } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTasks, useTeam } from '@/lib/api';
import type { ChatMessage } from '@/features/chat/api';
import { MuntejBubble, MuntejText, UserBubble, contentDirection } from '@/features/chat/Bubbles';
import { markOnboarding, setAccountName, setMyName, stepFrom, useOnboarding, type Step } from './api';
import { ONBOARDING_NS } from './strings';

type Opts = {
  messages: ChatMessage[];
  setText: (v: string) => void;
  focusInput: () => void;
};

export function useOnboardingCoach({ messages, setText, focusInput }: Opts) {
  const { t } = useScreenT(ONBOARDING_NS);
  const { lang } = useDirection();
  const qc = useQueryClient();
  const me = useMyProfile();
  const row = useOnboarding(me.data?.id);
  const tasks = useTasks();
  const team = useTeam();
  // local moments the data can't show: the company question right after the name, the "value" right after a task
  const [local, setLocal] = useState<Step | null>(null);
  const [demo, setDemo] = useState<'idle' | 'typing' | 'shown'>('idle');
  const tryStart = useRef<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const finishedOnce = useRef(false);
  // the name they just typed (the profile refetch can lag behind the next bubble)
  const [typedName, setTypedName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const r = row.data;
  const ready = !!r && !!me.data && !!tasks.data && !!team.data;
  const active = ready && !r!.finished_at && !r!.dismissed;
  const others = (team.data ?? []).filter((p) => p.id !== me.data?.id);
  const computed: Step = ready ? stepFrom(r!, me.data!, tasks.data ?? [], team.data ?? []) : 'done';
  const step: Step = local === 'company' && computed === 'name' ? 'company' : local === 'value' ? 'value' : computed;
  const firstName = (typedName ?? ((lang === 'ar' && me.data?.full_name_ar) || me.data?.full_name || '')).split(' ')[0];
  const mate = others[0] ? ((others[0].full_name_ar || others[0].full_name) ?? '').split(' ')[0] : '';

  // the demo: Saree3 types the sample into the box, then "sends" it (the card is a sample, nothing is saved)
  useEffect(() => {
    if (!active || step !== 'demo' || demo !== 'idle') return;
    setDemo('typing');
    const full = t('demoUser');
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setText(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(id);
        setTimeout(() => {
          setText('');
          setDemo('shown');
        }, 700);
      }
    }, 55);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  // your turn: the first task Muntej creates after this moment → the value
  useEffect(() => {
    if (step !== 'try') return;
    if (tryStart.current === null) tryStart.current = Date.now();
    const made = messages.find((m) => m.role === 'assistant' && m.action === 'created' && Date.parse(m.created_at) > (tryStart.current ?? 0) - 5_000);
    if (made) {
      setSeconds(Math.max(3, Math.round((Date.now() - (tryStart.current ?? Date.now())) / 1000)));
      setLocal('value');
    }
  }, [messages, step]);

  // all done: once
  useEffect(() => {
    if (active && step === 'done' && !finishedOnce.current) {
      finishedOnce.current = true;
      markOnboarding(qc, { finished: true }).catch(() => {});
    }
  }, [active, step, qc]);

  /** answers to the name / company questions are Saree3's, not tasks */
  const intercept = (text: string): boolean => {
    if (!active || !me.data) return false;
    if (step === 'name') {
      setTypedName(text.trim());
      setLocal('company');
      setMyName(qc, me.data.id, text).catch((e) => setErr((e as Error).message));
      return true;
    }
    if (step === 'company') {
      setErr(null);
      setAccountName(qc, text)
        .then(() => setLocal(null))
        .catch((e) => setErr((e as Error).message));
      return true;
    }
    return false;
  };

  const skip = () => markOnboarding(qc, { dismissed: true }).catch(() => {});
  const draft = (v: string) => {
    setText(v);
    focusInput();
  };

  let render: ReactNode = null;
  if (active) {
    const Skip = <ChipButton label={t('skip')} quiet onPress={skip} />;
    if (step === 'name') render = <Coach text={t('hello')} actions={Skip} />;
    else if (step === 'company')
      render = <Coach text={t('askCompany', { name: firstName })} actions={Skip} />;
    else if (step === 'demo')
      render = (
        <>
          <Coach text={t('demoIntro')} />
          {demo === 'shown' && (
            <>
              <UserBubble text={t('demoUser')} />
              <Coach text={t('demoExplain')} below={<DemoCard title={t('demoUser')} />} actions={
                <>
                  <ChipButton label={t('demoNext')} onPress={() => markOnboarding(qc, { demo_seen: true }).then(() => focusInput()).catch(() => {})} />
                  {Skip}
                </>
              } />
            </>
          )}
        </>
      );
    else if (step === 'try') render = <Coach text={t('tryIt')} actions={Skip} />;
    else if (step === 'value')
      render = <Coach text={t('value', { s: seconds })} actions={<ChipButton label={t('valueNext')} onPress={() => setLocal(null)} />} />;
    else if (step === 'team')
      render = (
        <Coach
          text={`${t('team')}\n"${t('teamExample')}"\n${t('teamHint')}`}
          actions={
            <>
              <ChipButton label={t('teamUse')} onPress={() => draft(t('teamExample'))} />
              {Skip}
            </>
          }
        />
      );
    else if (step === 'handoff')
      render = (
        <Coach
          text={`${t('handoff', { name: mate })}\n"${t('handoffExample', { name: mate })}"`}
          actions={
            <>
              <ChipButton label={t('handoffUse')} onPress={() => draft(t('handoffExample', { name: mate }))} />
              {Skip}
            </>
          }
        />
      );
    else if (step === 'done') render = <Coach text={t('finished')} />;
  }

  if (render && err)
    render = (
      <>
        {render}
        <AppText variant="small" color="red" style={{ paddingStart: 38 }}>
          {err}
        </AppText>
      </>
    );

  return { active, render, intercept, glow: active && (step === 'try' || step === 'name' || step === 'company') };
}

function Coach({ text, below, actions }: { text: string; below?: ReactNode; actions?: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <MuntejBubble mood="talk" below={below}>
        <MuntejText text={text} />
      </MuntejBubble>
      {!!actions && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingStart: 38 }}>{actions}</View>}
    </View>
  );
}

function ChipButton({ label, onPress, quiet }: { label: string; onPress: () => void; quiet?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: sizes.touch - 4,
        justifyContent: 'center',
        paddingHorizontal: 16,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: quiet ? colors.border : colors.primary,
        backgroundColor: quiet ? colors.surface : colors.primary,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <AppText variant="small" weight="bold" color={quiet ? 'textMuted' : 'onDark'}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** The sample task card in the demo: looks like the real one, but it's only a picture of what Muntej does */
function DemoCard({ title }: { title: string }) {
  const { t } = useScreenT(ONBOARDING_NS);
  return (
    <View
      style={{
        alignSelf: 'stretch',
        backgroundColor: colors.surface,
        borderRadius: radius.tile,
        borderWidth: 1,
        borderColor: colors.borderBlue,
        borderStartWidth: 4,
        borderStartColor: colors.primary,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CircleCheck color={colors.greenText} size={13} strokeWidth={2.4} />
        <AppText variant="micro" weight="bold" color="greenText">
          {t('demoAdded')}
        </AppText>
      </View>
      <AppText weight="bold" style={{ writingDirection: contentDirection(title) }}>
        {title}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Avatar name={t('demoWho')} size={24} />
        <AppText variant="small" weight="bold">
          {t('demoWho')}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Pill icon={<Calendar color={colors.primary} size={12} strokeWidth={2.2} />} text={t('demoDue')} />
        <Pill icon={<BellRing color={colors.primary} size={12} strokeWidth={2.2} />} text={t('demoCheck')} />
      </View>
    </View>
  );
}

function Pill({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.primaryTint }}>
      {icon}
      <AppText variant="caption" weight="semibold" color="primary" style={{ writingDirection: contentDirection(text) }}>
        {text}
      </AppText>
    </View>
  );
}
