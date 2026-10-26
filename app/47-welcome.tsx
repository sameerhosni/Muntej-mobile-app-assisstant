// Screen 47 · Saree3's setup guide — no mockup; v2 light style per design/TOKENS.md
// Saree3 checks what's missing in the account (src/features/onboarding/setup.ts) and walks through it one item at a
// time. Each item says WHY it matters, then "Do it for me" (he does it with a smart default and shows the result) or
// "Teach me" (he takes you to the screen where it lives; its one-time tip explains it). "Later" skips an item.
//   owner  name + company → team (paste emails) → who reports to whom → email (Google / Microsoft) → notifications
//          (allow + a test) → first task (and what Saree3 does next with it)
//   member name → notifications → a practice check-in → email (optional)
// The Home strip shows "Setting up your account 3/6" and reopens here at the next missing item.
import { useState, type ComponentType, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  Briefcase,
  Building2,
  Check,
  GraduationCap,
  ListChecks,
  Mail,
  Mic,
  Network,
  Send,
  Square,
  Users,
  X,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Button } from '@/components/ui';
import { SectorPicker } from '@/features/sectors/SectorPicker';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { Munti } from '@/features/munti/Munti';
import { contentDirection } from '@/features/chat/Bubbles';
import { invalidateTaskData, sendChat, taskSnapshot, type TaskSnapshot } from '@/features/chat/api';
import { MicDeniedError, useVoiceRecorder } from '@/features/capture/useVoiceRecorder';
import { transcribeAudio } from '@/features/capture/api';
import { useUpsertPerson } from '@/features/org/model';
import { nameFromEmail } from '@/features/invite/api';
import { useConnectionActions, useProviders, type ProviderId } from '@/features/sources/connections';
import { enablePush, sendTestPush, usePushStatus } from '@/features/notifications/push';
import { markOnboarding, setAccountName, setMyName } from '@/features/onboarding/api';
import { useSetup, type SetupKey } from '@/features/onboarding/setup';
import { TOUR_NS } from '@/features/onboarding/tourStrings';
import { BuildTeamCard } from '@/features/teamImport/BuildTeamCard';

type T = (k: string, o?: Record<string, unknown>) => string;
const ICON: Record<SetupKey, ComponentType<LucideProps>> = {
  profile: Building2,
  sector: Briefcase,
  team: Users,
  structure: Network,
  email: Mail,
  notify: BellRing,
  task: ListChecks,
  checkin: GraduationCap,
};
/** "Teach me": the screen where it lives (its one-time tip explains it there) */
const TEACH: Partial<Record<SetupKey, Href>> = {
  sector: '/12-sources',
  team: '/48-invite',
  structure: '/39-team',
  email: '/42-incoming',
  notify: '/settings',
  task: { pathname: '/02-capture', params: { mode: 'text' } },
};
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: object) => Promise<{ error: { message: string } | null }>;

export default function SetupGuide() {
  const { t } = useScreenT(TOUR_NS);
  const { lang } = useDirection();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const setup = useSetup();
  const [skipped, setSkipped] = useState<SetupKey[]>([]);
  const [open, setOpen] = useState<SetupKey | null>(null);

  const pending = setup.items.filter((i) => !i.done && !skipped.includes(i.key));
  const current = open && setup.items.some((i) => i.key === open && !i.done) ? open : (pending[0]?.key ?? null);
  const allDone = setup.done === setup.total;
  const firstName = setup.me ? ((lang === 'ar' && setup.me.full_name_ar) || setup.me.full_name).split(' ')[0] : '';

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['onboarding'] }),
      qc.invalidateQueries({ queryKey: ['team'] }),
      qc.invalidateQueries({ queryKey: ['connections'] }),
      qc.invalidateQueries({ queryKey: ['myAccounts'] }),
      qc.invalidateQueries({ queryKey: ['me'] }),
      invalidateTaskData(qc),
    ]);
  const leave = async () => {
    // all done → finished; otherwise paused (the Home strip keeps the count and brings it back)
    await markOnboarding(qc, allDone ? { finished: true } : { dismissed: true }).catch(() => {});
    router.replace('/');
  };
  const skip = (k: SetupKey) => {
    setSkipped((s) => [...s, k]);
    setOpen(null);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Saree3 + "Setting up your account" + progress + close */}
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingBottom: spacing.md,
          paddingHorizontal: spacing.screen,
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Munti size="md" mood={allDone ? 'celebrate' : 'talk'} />
          <View style={{ flex: 1 }}>
            <AppText weight="extrabold" style={{ fontSize: 18 }}>
              {t('header')}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {t('progress', { done: setup.done, total: setup.total })}
            </AppText>
          </View>
          <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel={t('later')} hitSlop={8} style={{ padding: 6 }}>
            <X color={colors.textMuted} size={22} />
          </Pressable>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' }}>
          <View style={{ width: `${setup.total ? (100 * setup.done) / setup.total : 0}%`, height: 6, backgroundColor: colors.green }} />
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.screen, gap: spacing.md, paddingBottom: 40 }}>
        {!setup.ready ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Said text={allDone ? t('allDone') : t('hi', { name: firstName })} />
            {setup.items.map((i) => {
              const Icon = ICON[i.key];
              const expanded = i.key === current;
              return (
                <View
                  key={i.key}
                  style={{
                    borderRadius: radius.tile,
                    backgroundColor: colors.surface,
                    borderWidth: expanded ? 1.5 : 1,
                    borderColor: expanded ? colors.primary : colors.border,
                    overflow: 'hidden',
                  }}
                >
                  <Pressable
                    onPress={() => !i.done && setOpen(i.key)}
                    accessibilityRole="button"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, minHeight: sizes.touch + 8 }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: i.done ? colors.greenTint : colors.primaryTint,
                      }}
                    >
                      {i.done ? <Check color={colors.green} size={18} strokeWidth={2.6} /> : <Icon color={colors.primary} size={18} />}
                    </View>
                    <AppText weight="bold" style={{ flex: 1 }} color={i.done ? 'textMuted' : 'text'}>
                      {t(`t_${i.key}`)}
                    </AppText>
                    {skipped.includes(i.key) && !i.done && (
                      <AppText variant="caption" color="textFaint">
                        {t('later')}
                      </AppText>
                    )}
                  </Pressable>
                  {expanded && (
                    <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}>
                      <AppText color="textSoft">{t(`w_${i.key}`)}</AppText>
                      <Step k={i.key} t={t} setup={setup} onDone={refresh} />
                      <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'center' }}>
                        {!!TEACH[i.key] && (
                          <Pressable
                            onPress={() => router.push(TEACH[i.key]!)}
                            accessibilityRole="button"
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: sizes.touch }}
                          >
                            <GraduationCap color={colors.primary} size={18} />
                            <AppText weight="bold" color="primary">
                              {t('teachMe')}
                            </AppText>
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => skip(i.key)}
                          accessibilityRole="button"
                          style={{ minHeight: sizes.touch, justifyContent: 'center' }}
                        >
                          <AppText weight="semibold" color="textMuted">
                            {t('skip')}
                          </AppText>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
            {(allDone || !current) && <Button label={t('goHome')} onPress={leave} />}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Saree3 says it */
function Said({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 18, borderTopStartRadius: 4, padding: spacing.lg, boxShadow: shadows.card }}>
      <AppText style={{ fontSize: 16, lineHeight: 24, writingDirection: contentDirection(text) }}>{text}</AppText>
    </View>
  );
}

type Setup = ReturnType<typeof useSetup>;

/** the "do it for me" part of each item */
function Step({ k, t, setup, onDone }: { k: SetupKey; t: T; setup: Setup; onDone: () => Promise<unknown> }) {
  switch (k) {
    case 'profile':
      return <ProfileStep t={t} setup={setup} onDone={onDone} />;
    case 'sector':
      return <SectorPicker showAsk={false} onPicked={() => onDone()} />;
    case 'team':
      return <TeamStep t={t} setup={setup} onDone={onDone} />;
    case 'structure':
      return <StructureStep t={t} setup={setup} onDone={onDone} />;
    case 'email':
      return <EmailStep t={t} />;
    case 'notify':
      return <NotifyStep t={t} />;
    case 'task':
      return <TaskStep t={t} onDone={onDone} />;
    case 'checkin':
      return <CheckinStep t={t} onDone={onDone} />;
  }
}

function ProfileStep({ t, setup, onDone }: { t: T; setup: Setup; onDone: () => Promise<unknown> }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(setup.me?.full_name ?? '');
  const [company, setCompany] = useState(setup.company);
  const [busy, setBusy] = useState(false);
  const save = async (changed: boolean) => {
    setBusy(true);
    try {
      if (changed && setup.me && name.trim() && name.trim() !== setup.me.full_name) await setMyName(qc, setup.me.id, name);
      if (changed && !setup.member && company.trim() && company.trim() !== setup.company) await setAccountName(qc, company);
      await markOnboarding(qc, { account_named: true });
      await onDone();
    } catch {
      // stays open; they can try again
    } finally {
      setBusy(false);
    }
  };
  if (editing)
    return (
      <View style={{ gap: spacing.sm }}>
        <Field value={name} onChange={setName} placeholder={t('namePh')} />
        {!setup.member && <Field value={company} onChange={setCompany} placeholder={t('companyPh')} />}
        <Button label={t('save')} loading={busy} disabled={!name.trim()} onPress={() => save(true)} />
      </View>
    );
  return (
    <View style={{ gap: spacing.sm }}>
      <Said
        text={
          setup.member
            ? t('p_profileMember', { name: setup.me?.full_name ?? '' })
            : t('p_profile', { name: setup.me?.full_name ?? '', company: setup.company })
        }
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label={t('yes')} size="md" loading={busy} onPress={() => save(false)} style={{ flex: 1 }} />
        <Button label={t('change')} size="md" variant="outline" onPress={() => setEditing(true)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function TeamStep({ t, setup, onDone }: { t: T; setup: Setup; onDone: () => Promise<unknown> }) {
  const upsert = useUpsertPerson();
  const [text, setText] = useState('');
  const [count, setCount] = useState(0);
  const emails = [...new Set(text.split(/[\s,;،]+/).map((x) => x.trim().toLowerCase()))].filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  const invite = async () => {
    let n = 0;
    for (const e of emails) {
      try {
        await upsert.mutateAsync({ full_name: nameFromEmail(e), email: e, role: 'employee', manager_id: setup.me?.id ?? null });
        n++;
      } catch {
        // already in the team: fine
      }
    }
    setCount(n);
    setText('');
    await onDone();
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <Said text={t('p_team')} />
      {/* the smart way: the whole team from a photo, a file or a sentence (screen 61) */}
      <BuildTeamCard />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={t('teamPh')}
        placeholderTextColor={colors.textFaint}
        multiline
        autoCapitalize="none"
        keyboardType="email-address"
        style={{
          minHeight: 80,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: colors.borderBlue,
          padding: spacing.md,
          color: colors.text,
          fontSize: 16,
          textAlign: 'left',
          writingDirection: 'ltr',
          textAlignVertical: 'top',
        }}
      />
      <Button
        label={`${t('doIt')} · ${t('invite')}${emails.length ? ` (${emails.length})` : ''}`}
        loading={upsert.isPending}
        disabled={!emails.length}
        onPress={invite}
      />
      {count > 0 && (
        <AppText weight="semibold" color="green">
          {t('invited', { count, n: count })}
        </AppText>
      )}
    </View>
  );
}

function StructureStep({ t, setup, onDone }: { t: T; setup: Setup; onDone: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const loose = setup.others.filter((p) => !p.manager_id && p.role !== 'admin');
  const names = loose.map((p) => p.full_name.split(' ')[0]).join('، ');
  const doIt = async () => {
    setBusy(true);
    for (const p of loose) await rpc('upsert_person', { p: { id: p.id, manager_id: setup.me?.id } }).catch(() => {});
    setBusy(false);
    await onDone();
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <Said text={t('p_structure', { names })} />
      <Button label={t('doIt')} loading={busy} onPress={doIt} />
    </View>
  );
}

function EmailStep({ t }: { t: T }) {
  const providers = useProviders();
  const actions = useConnectionActions();
  const offered = (['google', 'microsoft'] as ProviderId[]).filter((id) => (providers.data ?? []).some((p) => p.id === id && p.configured));
  return (
    <View style={{ gap: spacing.sm }}>
      <Said text={offered.length ? t('p_email') : t('emailUnavailable')} />
      {offered.map((id) => (
        <Pressable
          key={id}
          onPress={() => actions.connect(id, '/47-welcome').catch(() => {})}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            minHeight: sizes.touch + 4,
            borderRadius: radius.pill,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <AppText weight="extrabold" style={{ fontSize: 18, color: id === 'google' ? '#EA4335' : '#0078D4' }}>
            {id === 'google' ? 'G' : 'M'}
          </AppText>
          <AppText weight="bold">{id === 'google' ? t('withGoogle') : t('withMicrosoft')}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

function NotifyStep({ t }: { t: T }) {
  const status = usePushStatus();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const doIt = async () => {
    setBusy(true);
    await enablePush().catch(() => {});
    setBusy(false);
  };
  // once on, a test right away ("did you get it?")
  const test = async () => {
    setBusy(true);
    await sendTestPush().catch(() => 0);
    setBusy(false);
    setNote(t('notifyTest'));
  };
  if (status === 'denied')
    return (
      <View style={{ gap: spacing.sm }}>
        <Said text={t('notifyDenied')} />
        <Button label={t('openSettings')} onPress={() => Linking.openSettings()} />
      </View>
    );
  return (
    <View style={{ gap: spacing.sm }}>
      <Said text={note ?? t('p_notify')} />
      {!note && <Button label={t('doIt')} loading={busy} onPress={status === 'on' ? test : doIt} />}
    </View>
  );
}

function TaskStep({ t, onDone }: { t: T; onDone: () => Promise<unknown> }) {
  const { lang, isRTL } = useDirection();
  const rec = useVoiceRecorder();
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'rec' | 'writing' | 'thinking'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<TaskSnapshot | null>(null);
  const when = (iso: string | null | undefined) =>
    iso
      ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', {
          timeZone: 'Asia/Riyadh',
          weekday: 'long',
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(iso))
      : null;

  const send = async (said: string, source: 'text' | 'voice') => {
    if (!said.trim()) return;
    setErr(null);
    setState('thinking');
    try {
      const rows = await sendChat(said.trim(), source);
      const row = rows.find((r) => r.role === 'assistant' && r.action === 'created');
      const snap = row ? taskSnapshot(row.payload) : null;
      if (snap) setMade(snap);
      else setErr(t('noTask'));
    } catch {
      setErr(t('noTask'));
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

  // after: what Saree3 does next with it (the follow-up, in plain words)
  if (made)
    return (
      <View style={{ gap: spacing.sm }}>
        <View style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryTint }}>
          <AppText weight="bold" style={{ writingDirection: contentDirection(made.title) }}>
            {made.title}
          </AppText>
        </View>
        <AppText weight="bold">{t('nextTitle')}</AppText>
        {[
          made.owner_name ? t('nextWho', { name: made.owner_name }) : null,
          made.next_check_at ? t('nextCheck', { when: when(made.next_check_at) }) : null,
          made.due_at ? t('nextDue', { when: when(made.due_at) }) : null,
          t('nextYou'),
        ]
          .filter((x): x is string => !!x)
          .map((line) => (
            <View key={line} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
              <Check color={colors.green} size={16} style={{ marginTop: 3 }} />
              <AppText style={{ flex: 1 }}>{line}</AppText>
            </View>
          ))}
        <Button label={t('yes')} onPress={() => onDone()} />
      </View>
    );

  const busy = state === 'thinking' || state === 'writing';
  return (
    <View style={{ gap: spacing.sm }}>
      <Said text={t('p_task')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
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
          value={state === 'writing' ? t('writing') : state === 'rec' ? '' : text}
          onChangeText={setText}
          placeholder={state === 'rec' ? `🔴 ${t('stopTalk')}` : t('taskPh')}
          placeholderTextColor={colors.textFaint}
          editable={state === 'idle'}
          multiline
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
            textAlign: isRTL ? 'right' : 'left',
            writingDirection: contentDirection(text),
          }}
        />
        <Round
          label={state === 'rec' ? t('stopTalk') : t('talk')}
          bg={state === 'rec' ? colors.red : colors.primaryTint}
          onPress={talk}
          disabled={busy}
        >
          {state === 'rec' ? <Square color={colors.onDark} size={18} fill={colors.onDark} /> : <Mic color={colors.primary} size={22} />}
        </Round>
        <Round label={t('send')} bg={colors.primary} onPress={() => send(text, 'text')} disabled={!text.trim() || state !== 'idle'}>
          {busy ? (
            <ActivityIndicator color={colors.onDark} />
          ) : (
            <Send color={colors.onDark} size={20} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          )}
        </Round>
      </View>
      {state === 'thinking' && <AppText color="textMuted">{t('thinking')}</AppText>}
      {!!err && <AppText color="red">{err}</AppText>}
    </View>
  );
}

function CheckinStep({ t, onDone }: { t: T; onDone: () => Promise<unknown> }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);
  const options: [string, string][] = [
    ['mDone', 'mDoneReact'],
    ['mOnTrack', 'mOnTrackReact'],
    ['mBlocked', 'mBlockedReact'],
  ];
  const pick = async (k: string) => {
    setPicked(k);
    await markOnboarding(qc, { demo_seen: true }).catch(() => {});
    setTimeout(() => onDone(), 1800);
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          flexDirection: 'row',
          gap: spacing.md,
          alignItems: 'center',
          padding: spacing.lg,
          borderRadius: radius.cardLg,
          backgroundColor: colors.bg,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <BellRing color={colors.primary} size={20} />
        <View style={{ flex: 1 }}>
          <AppText weight="bold">{t('notifTitle')}</AppText>
          <AppText variant="small" color="textSoft">
            {t('notifBody')}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {options.map(([k]) => (
          <Pressable
            key={k}
            onPress={() => pick(k)}
            disabled={!!picked}
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
      {!!picked && <Said text={t(options.find(([k]) => k === picked)![1])} />}
    </View>
  );
}

function Field({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const { isRTL } = useDirection();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      style={{
        minHeight: sizes.touch + 4,
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderColor: colors.borderBlue,
        paddingHorizontal: spacing.md,
        color: colors.text,
        fontSize: 16,
        textAlign: isRTL ? 'right' : 'left',
      }}
    />
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
        width: 48,
        height: 48,
        borderRadius: 24,
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
