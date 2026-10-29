// The setup chat for an invited manager or employee (screen 63; onboarding mockup rows 2 and 3). Nothing to type:
// their role, manager and team come from whoever added them, so Saree3 only confirms them ("right?"), asks how to
// reach them and offers the fingerprint. A manager then sees who in their team has joined (remind them now) and can
// give a first task; an employee gets their first task right in the chat with Got it / Need time / Need help.
// Leaving halfway: the defaults stay (reached on both, no fingerprint) and Home offers the rest once.
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText, Button } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useTasks, useTeam, type Profile } from '@/lib/api';
import { contentDirection, MuntejBubble, MuntejText, TypingBubble, UserBubble } from '@/features/chat/Bubbles';
import { invalidateTaskData, sendChat, taskSnapshot } from '@/features/chat/api';
import { sendInvites } from '@/features/invite/api';
import { useAlertPrefs } from '@/features/alerts/useAlertPrefs';
import { biometricBuild, biometricReady, deviceUser, enableBiometric } from '@/features/auth/deviceKey';
import { markOnboarding, setMyName } from './api';
import { useSetup } from './setup';
import { SETUP_CHAT_NS } from './setupChatStrings';
import { ChatHeader, Chips, Done, InputBar, Mini, type Chip } from './chatParts';

type Stage = 'confirm' | 'fixName' | 'fixOther' | 'reach' | 'bio' | 'team' | 'task' | 'first' | 'done';
type Reach = 'push' | 'whatsapp' | 'both';
type FirstTask = { id: string; title: string; due_at: string | null };
type Msg =
  | { id: number; kind: 'bot' | 'user'; text: string }
  | { id: number; kind: 'who' }
  | { id: number; kind: 'first'; task: FirstTask }
  | { id: number; kind: 'done' };
type WithoutId<M> = M extends unknown ? Omit<M, 'id'> : never;

const YES = /^(صح|صحيح|تمام|اي|ايوه|إيه|ايه|نعم|اوكي|أوكي|yes|yep|ok|okay|right|correct|sure)[.!\s]*$/i;

export function MemberSetupChat() {
  const { t } = useScreenT(SETUP_CHAT_NS);
  const { t: tg } = useTranslation();
  const { lang } = useDirection();
  const qc = useQueryClient();
  const setup = useSetup();
  const team = useTeam();
  const tasks = useTasks();
  const prefs = useAlertPrefs();
  const scroll = useRef<ScrollView>(null);
  const nextId = useRef(1);
  const started = useRef(false);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [stage, setStage] = useState<Stage>('confirm');
  const [busy, setBusy] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);

  const add = (...m: WithoutId<Msg>[]) => setMsgs((old) => [...old, ...m.map((x) => ({ ...x, id: nextId.current++ }) as Msg)]);
  const bot = (s: string) => add({ kind: 'bot', text: s });
  const user = (s: string) => add({ kind: 'user', text: s });

  const me = setup.me!;
  const people = team.data ?? [];
  const first = (p: Profile | undefined) => (p ? ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0] : '');
  const boss = people.find((p) => p.id === me.manager_id);
  const bossName = first(boss) || t('yourManager');
  const reports = people.filter((p) => p.manager_id === me.id && p.id !== me.id);
  const isManager = me.role !== 'employee' || reports.length > 0;
  const firstTask = (tasks.data ?? []).find((x) => x.owner_id === me.id && x.status === 'assigned' && !!x.assigner_id && x.assigner_id !== me.id);
  // who gave it (not always their manager)
  const giver = first(people.find((p) => p.id === firstTask?.assigner_id)) || bossName;

  // ── start: confirm what the person who added them filled in (or, coming back, the questions still open) ──
  useEffect(() => {
    if (started.current || !team.data || !tasks.data) return;
    started.current = true;
    track('setup_chat_open', { role: isManager ? 'manager' : 'employee', resume: !!setup.row?.account_named });
    if (setup.row?.account_named) return askReach();
    const hello = boss
      ? isManager
        ? t('m_helloMgr', { name: first(me), boss: bossName, company: setup.company, role: me.title || t('m_manager') })
        : t('m_helloEmp', { name: first(me), boss: bossName, company: setup.company })
      : t('m_helloSolo', { name: first(me), company: setup.company });
    add({ kind: 'bot', text: hello }, { kind: 'who' }, { kind: 'bot', text: `${t('m_intro')} ${t('right')}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.data, tasks.data]);

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

  const confirmed = () =>
    run(t('thinking'), async () => {
      await markOnboarding(qc, { account_named: true });
      askReach();
    });
  const askReach = () => {
    setStage('reach');
    bot(t('m_askReach'));
  };
  const pickReach = (r: Reach) => {
    user(t(`how_${r}`));
    // no linked WhatsApp yet: app notifications until it is (the server sends WhatsApp only to a linked number)
    const wa = r !== 'push' && !!me.phone;
    prefs.setChannels({ push: r !== 'whatsapp' || !me.phone, whatsapp: wa });
    bot(r !== 'push' && !me.phone ? t('m_noWa') : t('m_reachSet', { how: t(`m_by_${r}`) }));
    afterReach();
  };
  const afterReach = async () => {
    // the fingerprint only on a phone that can, and once
    if (biometricBuild && !(await deviceUser().catch(() => null)) && (await biometricReady().catch(() => false))) {
      setStage('bio');
      return bot(t('m_askBio'));
    }
    afterBio();
  };
  const bio = (on: boolean) => {
    user(on ? t('m_bioYes') : t('later'));
    if (!on) return afterBio();
    run(t('thinking'), async () => {
      if (await enableBiometric(tg('auth.bioPrompt'))) bot(t('m_bioOn'));
      afterBio();
    });
  };
  // work waiting for them comes first (managers get tasks too), then a manager's team
  const afterBio = () => {
    if (firstTask) {
      setStage('first');
      add({ kind: 'bot', text: t('m_firstTask', { boss: giver }) }, { kind: 'first', task: firstTask });
      return;
    }
    if (!isManager) bot(t('m_noTaskYet', { boss: bossName }));
    afterFirst();
  };
  const afterFirst = () => {
    if (isManager && reports.length) return teamStatus();
    if (isManager) return askTask();
    finish();
  };

  // ── manager: who has joined, remind the rest, a first task ──
  const waiting = reports.filter((p) => p.status === 'pending' || !p.user_id);
  const teamStatus = () => {
    setStage('team');
    const joined = reports.filter((p) => !waiting.includes(p));
    if (!waiting.length) bot(t('m_teamAll', { names: joined.map(first).join('، ') }));
    else if (!joined.length) bot(t('m_teamNone', { names: waiting.map(first).join('، ') }));
    else bot(t('m_teamSome', { joined: joined.map(first).join('، '), waiting: waiting.map(first).join('، ') }));
    if (!waiting.length) askTask();
  };
  const remind = () => {
    user(t('m_remind'));
    run(t('thinking'), async () => {
      const ids = waiting.filter((p) => p.phone || p.email).map((p) => p.id);
      const res = ids.length ? await sendInvites(ids, 'auto').catch(() => []) : [];
      bot(res.some((r) => r.whatsapp === 'sent' || r.email === 'invited') ? t('m_reminded') : t('m_remindFail', { boss: bossName }));
      askTask();
    });
  };
  const askTask = () => {
    setStage('task');
    bot(t('m_askTask'));
  };
  const giveTask = (said: string, source: 'text' | 'voice') =>
    run(t('thinking'), async () => {
      const rows = await sendChat(said, source);
      const row = rows.find((r) => r.role === 'assistant' && r.action === 'created');
      const snap = row ? taskSnapshot(row.payload) : null;
      if (!snap) return bot(t('noTask'));
      await invalidateTaskData(qc);
      const mine = !snap.owner_id || snap.owner_id === me.id;
      bot(`«${snap.title}» · ${mine ? t('yours') : t('delivered', { name: snap.owner_name ?? '' })}`);
      finish();
    });

  // ── employee: answer the first task right here ──
  const answer = (reply: 'got_it' | 'need_time' | 'blocked', task: FirstTask) => {
    user(t(reply === 'got_it' ? 'm_gotIt' : reply === 'need_time' ? 'm_needTime' : 'm_needHelp'));
    run(t('thinking'), async () => {
      const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: object) => PromiseLike<{ error: { message: string } | null }>;
      const { error } = await rpc('checkin_reply', { p_task: task.id, p_reply: reply, p_note: null });
      if (error) throw new Error(error.message);
      setAnswered(true);
      invalidateTaskData(qc);
      bot(t(reply === 'got_it' ? 'm_saidGotIt' : reply === 'need_time' ? 'm_saidTime' : 'm_saidHelp', { boss: giver }));
      afterFirst();
    });
  };

  const finish = () => {
    setStage('done');
    add({ kind: 'done' });
    track('setup_chat_done', { role: isManager ? 'manager' : 'employee' });
    markOnboarding(qc, { account_named: true, finished: true }).catch(() => {});
    setTimeout(() => router.replace('/' as Href), 3000);
  };
  const leave = async () => {
    track('setup_chat_leave', { role: isManager ? 'manager' : 'employee', stage });
    await markOnboarding(qc, { dismissed: true }).catch(() => {});
    router.replace('/' as Href);
  };

  const say = (s: string, source: 'text' | 'voice') => {
    if (busy) return;
    user(s);
    switch (stage) {
      case 'confirm':
        if (YES.test(s)) return confirmed();
        // anything else: a correction for whoever added them
        return fixOther(s);
      case 'fixName':
        return run(t('thinking'), async () => {
          await setMyName(qc, me.id, s);
          bot(t('fixedName', { name: s.split(' ')[0] }));
          await markOnboarding(qc, { account_named: true });
          askReach();
        });
      case 'fixOther':
        return fixOther(s);
      case 'task':
        return giveTask(s, source);
      default:
        return;
    }
  };
  // "something else is wrong": a task for their manager to fix it (the chat delivers and follows it up)
  const fixOther = (s: string) =>
    run(t('thinking'), async () => {
      const ask = lang === 'ar' ? `اطلب من ${bossName} يصحّح بياناتي في منتج: ${s}` : `Ask ${bossName} to fix my details in Muntej: ${s}`;
      await sendChat(ask, 'text').catch(() => []);
      bot(t('m_sentWrong', { boss: bossName }));
      await markOnboarding(qc, { account_named: true });
      askReach();
    });

  const chips: Chip[] = (() => {
    if (busy) return [];
    switch (stage) {
      case 'confirm':
        return [
          { label: t('m_yes'), primary: true, onPress: () => (user(t('m_yes')), confirmed()) },
          { label: t('m_wrongName'), onPress: () => (user(t('m_wrongName')), setStage('fixName'), bot(t('askName'))) },
          { label: t('m_wrongOther'), onPress: () => (user(t('m_wrongOther')), setStage('fixOther'), bot(t('m_askWrong', { boss: bossName }))) },
        ];
      case 'reach':
        return (['push', 'whatsapp', 'both'] as Reach[]).map((r) => ({ label: t(`how_${r}`), primary: r === 'both', onPress: () => pickReach(r) }));
      case 'bio':
        return [
          { label: t('m_bioYes'), primary: true, onPress: () => bio(true) },
          { label: t('later'), onPress: () => bio(false) },
        ];
      case 'team':
        return [
          { label: t('m_remind'), primary: true, onPress: remind },
          { label: t('later'), onPress: () => (user(t('later')), askTask()) },
        ];
      case 'task':
        return [{ label: t('later'), onPress: () => (user(t('later')), bot(t('taskSkipped')), finish()) }];
      default:
        return [];
    }
  })();
  const canType = ['confirm', 'fixName', 'fixOther', 'task'].includes(stage);
  const reachNow: Reach | null = prefs.prefs ? (prefs.prefs.channels.push && prefs.prefs.channels.whatsapp ? 'both' : prefs.prefs.channels.whatsapp ? 'whatsapp' : 'push') : null;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <ChatHeader sub={stage === 'done' ? t('subDone') : t('m_sub')} done={stage === 'done'} onClose={leave} />
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
            case 'who':
              // a manager sees their team; an employee their manager
              return (
                <MuntejBubble key={m.id}>
                  <Mini>
                    {isManager && reports.length ? (
                      reports.slice(0, 8).map((p) => (
                        <AppText key={p.id} variant="small" style={{ writingDirection: contentDirection() }}>
                          {`${(lang === 'ar' && p.full_name_ar) || p.full_name}${p.title ? ` · ${p.title}` : ''}`}
                        </AppText>
                      ))
                    ) : (
                      <>
                        <AppText weight="extrabold">{setup.company}</AppText>
                        <AppText variant="small" color="textMuted">
                          {[me.title, boss ? `${t('yourManager')}: ${(lang === 'ar' && boss.full_name_ar) || boss.full_name}` : null].filter(Boolean).join(' · ')}
                        </AppText>
                      </>
                    )}
                  </Mini>
                </MuntejBubble>
              );
            case 'first':
              return (
                <MuntejBubble key={m.id}>
                  <Mini>
                    <AppText weight="extrabold" style={{ writingDirection: contentDirection(m.task.title) }}>
                      {m.task.title}
                    </AppText>
                    <AppText variant="small" color="textMuted">
                      {giver}
                    </AppText>
                  </Mini>
                  {!answered && stage === 'first' && !busy && (
                    <>
                      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                        <Button label={t('m_gotIt')} size="md" onPress={() => answer('got_it', m.task)} style={{ flex: 1.2 }} />
                        <Button label={t('m_needTime')} size="md" variant="outline" onPress={() => answer('need_time', m.task)} style={{ flex: 1 }} />
                        <Button label={t('m_needHelp')} size="md" variant="outline" onPress={() => answer('blocked', m.task)} style={{ flex: 1 }} />
                      </View>
                      <AppText variant="caption" color="textMuted">
                        {t('m_tipGotIt', { boss: giver })}
                      </AppText>
                    </>
                  )}
                </MuntejBubble>
              );
            case 'done':
              return (
                <MuntejBubble key={m.id} mood="celebrate">
                  <AppText weight="extrabold">{t('m_doneTitle')}</AppText>
                  <Mini>
                    <Done text={t('m_doneDetails')} />
                    <Done text={`${t('m_doneReach')}: ${reachNow ? t(`how_${reachNow}`) : ''}`} />
                    {isManager && reports.length > 0 && <Done text={t('m_doneTeam')} />}
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
      {canType && <InputBar onSay={say} busy={!!busy} onBusy={setBusy} onError={bot} />}
    </KeyboardAvoidingView>
  );
}
