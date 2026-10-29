// Screen 63 · Saree3's setup chat — see the onboarding mockup (claude.ai artifact "Muntej auto-onboarding");
// v2 light style per design/TOKENS.md
// One conversation instead of forms (owner, 29 Oct). An admin: company (guessed from the email: "right?") → the team
// (said, typed, a photo, a file or the company directory; one tap confirms and invites) → the first task → Home by
// itself. An invited manager or employee: MemberSetupChat. Where it stands is read from real data (useSetup), so
// leaving halfway is fine: Home's card comes back here at the same question.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AppText, Button } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { track } from '@/lib/analytics';
import { contentDirection, MuntejBubble, MuntejText, TypingBubble, UserBubble } from '@/features/chat/Bubbles';
import { invalidateTaskData, sendChat, taskSnapshot, type TaskSnapshot } from '@/features/chat/api';
import { enablePush, usePushStatus } from '@/features/notifications/push';
import { sendInvites } from '@/features/invite/api';
import { SECTORS, useMySector, useSetSector, type Sector } from '@/features/sectors/sectors';
import { SECTOR_NS } from '@/features/sectors/SectorPicker';
import { applyDraft, canFile, canPhoto, readDirectory, readFile, readPhoto, readText, type Draft } from '@/features/teamImport/api';
import { markOnboarding, setAccountName, setMyName } from '@/features/onboarding/api';
import { useSetup } from '@/features/onboarding/setup';
import { SETUP_CHAT_NS } from '@/features/onboarding/setupChatStrings';
import { ChatHeader, Chips, Done, InputBar, Mini, Tag, type Chip } from '@/features/onboarding/chatParts';
import { MemberSetupChat } from '@/features/onboarding/MemberSetupChat';
import { walkthrough } from '@/features/walkthrough/store';

type Stage = 'company' | 'fixCompany' | 'fixName' | 'sector' | 'team' | 'draft' | 'task' | 'push' | 'done';
type Msg =
  | { id: number; kind: 'bot' | 'user'; text: string }
  | { id: number; kind: 'company' }
  | { id: number; kind: 'draft'; draft: Draft }
  | { id: number; kind: 'task'; task: TaskSnapshot; mine: boolean }
  | { id: number; kind: 'done' };
type WithoutId<M> = M extends unknown ? Omit<M, 'id'> : never;
type NewMsg = WithoutId<Msg>;

const YES = /^(صح|صحيح|تمام|اي|ايوه|إيه|ايه|نعم|اوكي|أوكي|yes|yep|ok|okay|right|correct|sure)[.!\s]*$/i;
const STEP: Record<Stage, number> = { company: 1, fixCompany: 1, fixName: 1, sector: 1, team: 2, draft: 2, task: 3, push: 3, done: 3 };

export default function SetupChatScreen() {
  const setup = useSetup();
  // a Home tour that was already running doesn't sit on top of the chat (it comes back after setup)
  useEffect(() => {
    if (walkthrough.current()) walkthrough.end(false);
  }, []);
  if (!setup.ready) return <ActivityIndicator color={colors.primary} style={{ flex: 1 }} />;
  return setup.member ? <MemberSetupChat /> : <AdminSetupChat />;
}

function AdminSetupChat() {
  const { t } = useScreenT(SETUP_CHAT_NS);
  const { t: ts } = useScreenT(SECTOR_NS);
  const { lang } = useDirection();
  const qc = useQueryClient();
  const setup = useSetup();
  const sector = useMySector();
  const setSector = useSetSector();
  const push = usePushStatus();
  const scroll = useRef<ScrollView>(null);
  const nextId = useRef(1);
  const started = useRef(false);
  // the last thing said about the team: a correction is read together with it ("and Reem is under Noura")
  const teamText = useRef('');

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [stage, setStage] = useState<Stage>('company');
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ invited: number | null; task: boolean }>({ invited: null, task: false });

  const add = (...m: NewMsg[]) => setMsgs((old) => [...old, ...m.map((x) => ({ ...x, id: nextId.current++ }) as Msg)]);
  const bot = (s: string) => add({ kind: 'bot', text: s });
  const user = (s: string) => add({ kind: 'user', text: s });
  const name = setup.me ? ((lang === 'ar' && setup.me.full_name_ar) || setup.me.full_name).split(' ')[0] : '';

  // ── where to start: the first step not done yet (real data), so coming back resumes at the same question ──
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track('setup_chat_open', { role: 'admin', resume: !!setup.row?.account_named });
    if (!setup.row?.account_named) {
      add({ kind: 'bot', text: t('hello', { name }) }, { kind: 'company' });
      setStage('company');
    } else goTeam(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasTask = () => setup.items.some((i) => i.key === 'task' && i.done);
  const goTeam = (first = false) => {
    if (setup.others.length > 0) return goTask(first);
    setStage('team');
    bot(first ? `${t('hi', { name })} ${t('askTeam')}` : t('askTeam'));
  };
  const goTask = (first = false) => {
    if (hasTask() || summary.task) return goPush();
    setStage('task');
    bot(first ? `${t('hi', { name })} ${t('askTask')}` : t('askTask'));
  };
  const goPush = () => {
    // notifications not on yet on a phone (denied: asking again wouldn't help)
    if (Platform.OS !== 'web' && push === 'error') {
      setStage('push');
      bot(t('askPush'));
      return;
    }
    finish();
  };
  const finish = () => {
    setStage('done');
    add({ kind: 'done' });
    track('setup_chat_done', { role: 'admin' });
    markOnboarding(qc, { finished: true }).catch(() => {});
    // Home opens by itself; "Go to Home" for anyone quicker
    setTimeout(() => router.replace('/' as Href), 3000);
  };
  const leave = async () => {
    const all = setup.row?.account_named && (setup.others.length > 0 || summary.invited !== null) && (hasTask() || summary.task);
    track('setup_chat_leave', { role: 'admin', stage });
    await markOnboarding(qc, all ? { finished: true } : { dismissed: true }).catch(() => {});
    router.replace('/' as Href);
  };

  // wraps every step: Saree3 "typing", and a plain message if it fails
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch {
      bot(t('failed'));
    } finally {
      setBusy(null);
    }
  };

  // ── company ──
  const afterCompany = async () => {
    await markOnboarding(qc, { account_named: true });
    if (!sector) {
      setStage('sector');
      bot(t('askSector'));
    } else goTeam();
  };
  const confirmCompany = () => run(t('thinking'), afterCompany);
  const pickSector = (s: Sector) => {
    user(ts(`s_${s}`));
    run(t('thinking'), async () => {
      await setSector.mutateAsync({ sector: s });
      goTeam();
    });
  };

  // ── team ──
  const showDraft = (d: Draft | null) => {
    if (!d) return;
    if (!d.people.length) return bot(t('readFail'));
    setStage('draft');
    add({ kind: 'draft', draft: d });
  };
  const readTeam = (said: string) =>
    run(t('reading'), async () => {
      teamText.current = teamText.current ? `${teamText.current}\n${said}` : said;
      showDraft(await readText(teamText.current));
    });
  const fromPhoto = (from: 'camera' | 'library') =>
    run(t('reading'), async () => {
      teamText.current = '';
      showDraft(await readPhoto(from));
    });
  const fromFile = () =>
    run(t('reading'), async () => {
      teamText.current = '';
      showDraft(await readFile());
    });
  const confirmTeam = (d: Draft) => {
    user(t('confirmInvite'));
    run(t('thinking'), async () => {
      const people = d.people.filter((p) => !p.skip);
      const res = await applyDraft(d.id, people);
      // WhatsApp (one-time join link) when there's a mobile, email otherwise
      const ids = people.filter((p) => res.ids[p.ref] && !p.existing_id && (p.phone || p.email)).map((p) => res.ids[p.ref]);
      const sent = ids.length ? (await sendInvites(ids, 'auto').catch(() => [])).filter((r) => r.whatsapp === 'sent' || r.email === 'invited').length : 0;
      setSummary((s) => ({ ...s, invited: sent }));
      await qc.invalidateQueries({ queryKey: ['team'] });
      if (res.failed.length)
        bot(t('invitedSome', { n: res.created + res.updated, failed: res.failed.length, names: res.failed.map((f) => f.name).join('، ') }));
      else bot(sent ? t('invited', { n: sent }) : t('noInvite'));
      setStage('task');
      bot(t('askTask'));
    });
  };
  const skipTeam = () => {
    user(t('laterTeam'));
    bot(t('teamSkipped'));
    goTask();
  };

  // ── first task ──
  const giveTask = (said: string, source: 'text' | 'voice') =>
    run(t('thinking'), async () => {
      const rows = await sendChat(said, source);
      const row = rows.find((r) => r.role === 'assistant' && r.action === 'created');
      const snap = row ? taskSnapshot(row.payload) : null;
      if (!snap) return bot(t('noTask'));
      await invalidateTaskData(qc);
      const mine = !snap.owner_id || snap.owner_id === setup.me?.id;
      add({ kind: 'task', task: snap, mine }, { kind: 'bot', text: mine ? t('yours') : t('delivered', { name: snap.owner_name ?? '' }) });
      setSummary((s) => ({ ...s, task: true }));
      goPush();
    });
  const skipTask = () => {
    user(t('later'));
    bot(t('taskSkipped'));
    goPush();
  };

  // ── what they typed or said, by stage ──
  const say = (s: string, source: 'text' | 'voice') => {
    if (busy) return;
    user(s);
    switch (stage) {
      case 'company':
        // "right" confirms; anything else is the company's real name
        if (YES.test(s)) return confirmCompany();
        return run(t('thinking'), async () => {
          await setAccountName(qc, s);
          bot(t('fixedCompany', { name: s }));
          await afterCompany();
        });
      case 'fixCompany':
        return run(t('thinking'), async () => {
          await setAccountName(qc, s);
          bot(t('fixedCompany', { name: s }));
          setStage('company');
          add({ kind: 'company' });
        });
      case 'fixName':
        return run(t('thinking'), async () => {
          if (setup.me) await setMyName(qc, setup.me.id, s);
          bot(t('fixedName', { name: s.split(' ')[0] }));
          setStage('company');
          add({ kind: 'company' });
        });
      case 'sector':
        return goTeam();
      case 'team':
      case 'draft':
        return readTeam(s);
      case 'task':
        return giveTask(s, source);
      default:
        return;
    }
  };

  // the quick answers under Saree3's last message
  const chips: Chip[] = (() => {
    if (busy) return [];
    switch (stage) {
      case 'company':
        return [
          { label: t('yes'), primary: true, onPress: () => (user(t('yes')), confirmCompany()) },
          { label: t('fix'), onPress: () => (user(t('fix')), setStage('fixCompany'), bot(t('askCompany'))) },
          { label: t('fixName'), onPress: () => (user(t('fixName')), setStage('fixName'), bot(t('askName'))) },
        ];
      case 'sector':
        return SECTORS.map((s) => ({ label: ts(`s_${s}`), onPress: () => pickSector(s) }));
      case 'team':
        return [
          ...(canPhoto && Platform.OS !== 'web' ? [{ label: t('camera'), onPress: () => fromPhoto('camera') }] : []),
          ...(canPhoto ? [{ label: t('photo'), onPress: () => fromPhoto('library') }] : []),
          ...(canFile ? [{ label: t('file'), onPress: fromFile }] : []),
          { label: t('directory'), onPress: () => readDirectory('microsoft_directory').catch(() => bot(t('failed'))) },
          { label: t('google'), onPress: () => readDirectory('google_directory').catch(() => bot(t('failed'))) },
          { label: t('laterTeam'), onPress: skipTeam },
        ];
      case 'task':
        return [{ label: t('later'), onPress: skipTask }];
      case 'push':
        return [
          { label: t('pushOn'), primary: true, onPress: () => (user(t('pushOn')), run(t('thinking'), async () => (await enablePush().catch(() => {}), finish()))) },
          { label: t('later'), onPress: () => (user(t('later')), finish()) },
        ];
      default:
        return [];
    }
  })();
  const canType = ['company', 'fixCompany', 'fixName', 'team', 'draft', 'task'].includes(stage);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <ChatHeader sub={stage === 'done' ? t('subDone') : t('sub', { n: STEP[stage] })} done={stage === 'done'} onClose={leave} />
      <ScrollView
        ref={scroll}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.screen, gap: spacing.md, paddingBottom: spacing.xl }}
      >
        {msgs.map((m) => {
          switch (m.kind) {
            case 'user':
              return <UserBubble key={m.id} text={m.text} />;
            case 'bot':
              return (
                <MuntejBubble key={m.id}>
                  <MuntejText text={m.text} />
                </MuntejBubble>
              );
            case 'company':
              return (
                <MuntejBubble key={m.id}>
                  <Mini>
                    <AppText weight="extrabold">{setup.company}</AppText>
                    <AppText variant="small" color="textMuted">
                      {[setup.me ? (lang === 'ar' && setup.me.full_name_ar) || setup.me.full_name : null, sector ? ts(`s_${sector}`) : null, t('you')]
                        .filter(Boolean)
                        .join(' · ')}
                    </AppText>
                    <Tag text={t('guessed')} />
                  </Mini>
                  <MuntejText text={t('right')} />
                </MuntejBubble>
              );
            case 'draft': {
              const people = m.draft.people.filter((p) => !p.skip);
              const managers = people.filter((p) => p.role === 'manager').length;
              const unsure = people.filter((p) => !p.phone && !p.email).length;
              const latest = msgs.filter((x) => x.kind === 'draft').at(-1)?.id === m.id;
              return (
                <MuntejBubble key={m.id}>
                  <AppText weight="extrabold">{t('draftTitle', { n: people.length })}</AppText>
                  <Mini>
                    {people.slice(0, 6).map((p) => (
                      <AppText key={p.ref} variant="small" numberOfLines={1} style={{ writingDirection: contentDirection() }}>
                        {`${(lang === 'ar' && p.full_name_ar) || p.full_name}${p.title ? ` · ${p.title}` : ''}`}
                      </AppText>
                    ))}
                    {people.length > 6 && (
                      <AppText variant="small" color="textMuted">
                        {`+${people.length - 6}`}
                      </AppText>
                    )}
                  </Mini>
                  {managers > 0 && (
                    <AppText variant="small" color="textMuted">
                      {t('draftManagers', { n: managers })}
                    </AppText>
                  )}
                  {unsure > 0 && <Tag text={t('draftUnsure', { n: unsure })} warn />}
                  {latest && stage === 'draft' && !busy && (
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Button label={t('confirmInvite')} size="md" onPress={() => confirmTeam(m.draft)} style={{ flex: 1.4 }} />
                      <Button
                        label={t('seeAll')}
                        size="md"
                        variant="outline"
                        onPress={() => router.push(`/62-team-review?id=${m.draft.id}` as Href)}
                        style={{ flex: 1 }}
                      />
                    </View>
                  )}
                </MuntejBubble>
              );
            }
            case 'task':
              return (
                <MuntejBubble key={m.id}>
                  <Mini>
                    <AppText weight="extrabold" style={{ writingDirection: contentDirection(m.task.title) }}>
                      {m.task.title}
                    </AppText>
                    {!m.mine && !!m.task.owner_name && (
                      <AppText variant="small" color="textMuted">
                        {m.task.owner_name}
                      </AppText>
                    )}
                  </Mini>
                </MuntejBubble>
              );
            case 'done':
              return (
                <MuntejBubble key={m.id} mood="celebrate">
                  <AppText weight="extrabold">{t('doneTitle')}</AppText>
                  <Mini>
                    <Done text={t('doneCompany')} />
                    <Done
                      text={setup.others.length || summary.invited !== null ? t('doneTeam', { n: summary.invited ?? setup.others.length }) : t('doneTeamLater')}
                      off={!setup.others.length && summary.invited === null}
                    />
                    <Done text={summary.task || hasTask() ? t('doneTask') : t('doneTaskLater')} off={!summary.task && !hasTask()} />
                  </Mini>
                  <MuntejText text={t('doneHome')} />
                  <Button label={t('goHome')} size="md" onPress={() => router.replace('/' as Href)} />
                </MuntejBubble>
              );
          }
        })}
        {!!busy && <TypingBubble label={busy} />}
        <Chips chips={chips} />
      </ScrollView>
      {/* type or talk: Saree3 understands an answer at any step */}
      {canType && <InputBar onSay={say} busy={!!busy} onBusy={setBusy} onError={bot} />}
    </KeyboardAvoidingView>
  );
}
