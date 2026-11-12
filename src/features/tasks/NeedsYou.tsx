// «يحتاجك» — the first tab on Tasks (owner, 9 Nov, N20: "add a tab under المهام called يحتاجك to find all tasks
// assigned to me… the employee asked for clarifications / the due date, and it didn't show on the manager UI, even the
// request to refuse the task"). Everything waiting on you, each decided on its row:
//   finished work to review (Approve / Send back) · more time, busy, approval and other decisions (Yes / No)
//   questions and comments from the person doing a task (open it to answer)
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText, Card } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { useDecisions, useMyProfile, useTasks, useTeam, type DecisionWithContext } from '@/lib/api';
import { useResolveDecision } from '@/features/decisions/useResolveDecision';
import { invalidateTaskData, keepTask, setTaskStatus } from '@/features/chat/api';
import { useCancelFlow } from './CancelFlow';
import { useIncomingCount } from '@/features/incoming/api';

const NS = registerStrings('needsYouTab', {
  en: {
    tab: 'Needs you',
    review: '👀 Waiting for your approval',
    finished: '{{name}} finished it',
    ask: '❓ Asks you',
    comment: '💬 Wrote to you',
    time: '⏰ Wants more time',
    busy: '✋ Too busy for it',
    approval: '✅ Asks for your approval',
    decision: '⚖️ Your call',
    approve: '✓ Approve',
    sendBack: '↩ Send back',
    yes: '✓ Agree',
    no: '✕ No',
    takeBack: '✓ Take it back',
    keepIt: '✕ No, they keep it',
    openReply: '💬 Open and reply',
    cancel: '✕ Asks you to cancel it',
    askup: '📨 A request for you',
    takeOn: '✓ Take it on',
    notNow: 'Not now',
    cancelIt: '✕ Cancel it',
    keepTask: '👍 Keep it',
    done: 'Done ✓',
    empty: 'Nothing waits on you 👌',
    failed: 'Didn’t save. Try again?',
  },
  ar: {
    tab: 'يحتاجك',
    review: '👀 تنتظر اعتمادك',
    finished: '{{name}} خلّصها',
    ask: '❓ يسألك',
    comment: '💬 كتب لك',
    time: '⏰ يبي وقت أكثر',
    busy: '✋ مشغول عنها',
    approval: '✅ يطلب موافقتك',
    decision: '⚖️ القرار لك',
    approve: '✓ اعتمد',
    sendBack: '↩ رجّعها',
    yes: '✓ موافق',
    no: '✕ لا',
    takeBack: '✓ خذها منه',
    keepIt: '✕ لا، يكمّل',
    openReply: '💬 افتحها وردّ',
    cancel: '✕ يطلب تلغيها',
    askup: '📨 طلب لك',
    takeOn: '✓ أضفها لي',
    notNow: 'تجاهل',
    cancelIt: '✕ ألغها',
    keepTask: '👍 خلّها',
    done: 'تم ✓',
    empty: 'ما فيه شي ينتظرك 👌',
    failed: 'ما انحفظ. جرّب مرة ثانية؟',
  },
});
export const NEEDS_NS = NS;

type AskAlert = { id: string; kind: 'detail_asked' | 'task_comment' | 'cancel_asked'; task_id: string; subject_id: string | null; title: string; title_ar: string | null; body: string | null; body_ar: string | null };

export type NeedRow = {
  key: string;
  kind: 'review' | 'ask' | 'comment' | 'time' | 'busy' | 'approval' | 'decision' | 'cancel' | 'askup';
  title: string;
  sub: string;
  taskId: string | null;
  decision?: DecisionWithContext;
  alertIds?: string[];
};

const TONE: Record<NeedRow['kind'], { bg: ColorToken; fg: ColorToken }> = {
  review: { bg: 'greenTint', fg: 'greenText' },
  ask: { bg: 'amberTint', fg: 'amberText' },
  comment: { bg: 'purpleTint', fg: 'purple' },
  time: { bg: 'primaryTint', fg: 'primary' },
  busy: { bg: 'redTint', fg: 'red' },
  approval: { bg: 'greenTint', fg: 'greenText' },
  decision: { bg: 'purpleTint', fg: 'purple' },
  cancel: { bg: 'redTint', fg: 'red' },
  askup: { bg: 'primaryTint', fg: 'primary' },
};

/** Everything waiting on the signed-in person (also gives the tab its count). */
export function useNeedsYou() {
  const { lang } = useDirection();
  const { t } = useScreenT(NS);
  const me = useMyProfile();
  const meId = me.data?.id;
  const team = useTeam();
  const tasks = useTasks();
  const decisions = useDecisions('pending');
  const asks = useQuery({
    queryKey: ['needsYouAsks', meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => any })
        .from('alerts')
        .select('id, kind, task_id, subject_id, title, title_ar, body, body_ar')
        .eq('profile_id', meId)
        .in('kind', ['detail_asked', 'task_comment', 'cancel_asked'])
        .is('read_at', null)
        .not('task_id', 'is', null)
        .gte('created_at', new Date(Date.now() - 14 * 86_400_000).toISOString())
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return (data ?? []) as AskAlert[];
    },
  });
  const ar = lang === 'ar';
  const first = (id: string | null | undefined) => {
    const p = id ? (team.data ?? []).find((x) => x.id === id) : undefined;
    return p ? ((ar && p.full_name_ar) || p.full_name).split(' ')[0] : '…';
  };
  const titleOf = (id: string | null) => (id ? (tasks.data ?? []).find((x) => x.id === id)?.title : undefined);
  const oneOn = useOneNeedsYouOn();
  const incoming = useIncomingCount();
  const shared = useQuery({
    queryKey: ['needsYouItems', meId],
    enabled: oneOn && !!meId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>)('my_needs_you');
      if (error) throw new Error(error.message);
      return (data ?? []) as { kind: string; task_id: string | null; decision_id: string | null }[];
    },
  });

  const reviews: NeedRow[] = (tasks.data ?? [])
    // finished work that is yours to approve: the shared list decides (you gave it, or a review round names you)
    .filter((x) => x.status === 'submitted' && x.owner_id !== meId)
    .map((x) => ({ key: `r-${x.id}`, kind: 'review' as const, title: x.title, sub: t('finished', { name: first(x.owner_id) }), taskId: x.id }));
  const rowsRaw: NeedRow[] = [
    ...reviews,
    ...(decisions.data ?? []).map((d) => {
      const kind: NeedRow['kind'] =
        d.type === 'extension_request' ? 'time' : d.type === 'priority_question' ? 'busy' : d.type === 'approval_request' ? 'approval' : (d.type as string) === 'task_request' ? 'askup' : 'decision';
      const words = (ar && d.recommendation_ar) || d.recommendation || d.recommendation_reason || '';
      return {
        key: `d-${d.id}`,
        kind,
        title: d.task?.title ?? ((ar && d.title_ar) || d.title),
        sub: [d.requester ? first(d.requester.id) : null, words ? `«${words}»` : null].filter(Boolean).join(' · '),
        taskId: d.task_id,
        decision: d,
      };
    }),
    // one row per task for questions / comments (several asks on one task read as one)
    ...Object.values(
      (asks.data ?? [])
        // a cancel request on a task that has closed since has nothing left to decide (reviewer, 10 Nov)
        .filter((a) => a.kind !== 'cancel_asked' || !['done', 'cancelled'].includes((tasks.data ?? []).find((x) => x.id === a.task_id)?.status ?? ''))
        .reduce<Record<string, AskAlert[]>>((m, a) => ((m[`${a.kind}:${a.task_id}`] ??= []).push(a), m), {}),
    ).map((list) => {
      const a = list[0];
      return {
        key: `a-${a.kind}-${a.task_id}`,
        kind: a.kind === 'task_comment' ? ('comment' as const) : a.kind === 'cancel_asked' ? ('cancel' as const) : ('ask' as const),
        title: titleOf(a.task_id) ?? ((ar && a.title_ar) || a.title),
        sub:
          a.kind === 'detail_asked'
            ? (ar && a.title_ar) || a.title
            : [first(a.subject_id), (ar && a.body_ar) || a.body ? `«${((ar && a.body_ar) || a.body || '').slice(0, 90)}»` : null].filter(Boolean).join(' · '),
        taskId: a.task_id,
        alertIds: list.map((x) => x.id),
      };
    }),
  ];
  // only what the shared list holds (needs_you_items, the same one WhatsApp and the report read — reviewer, 11 Nov):
  // one number everywhere
  const keep = (r: NeedRow) => {
    // the shared list didn't come (offline, an error): keep everything rather than say «nothing waits» (R61)
    if (!shared.data) return true;
    const list = shared.data;
    if (r.decision) return list.some((i) => i.kind === 'request' && i.decision_id === r.decision!.id);
    const kind = r.kind === 'ask' ? 'question' : r.kind;
    return list.some((i) => i.kind === kind && i.task_id === r.taskId);
  };
  // whoever is stuck waiting on your answer first, then finished work, then questions and comments (owner, 11 Nov)
  const ORDER: Record<NeedGroup, number> = { requests: 0, reviews: 1, questions: 2 };
  const rows = oneOn ? rowsRaw.filter(keep).sort((a, b) => ORDER[groupOf(a.kind)] - ORDER[groupOf(b.kind)]) : rowsRaw;
  // tasks found in your tools: their own filter, never in the count (owner, 11 Nov)
  return {
    rows,
    // the number everywhere is the shared list's own length (the rows may still be loading behind it — QA, 11 Nov:
    // Tasks said 4 while the tab said 8)
    count: oneOn && shared.data ? shared.data.length : rows.length,
    tools: incoming.count,
    oneOn,
    loading: tasks.isLoading || decisions.isLoading || asks.isLoading || (oneOn && shared.isLoading),
    // the number isn't known until the shared list came: a failed or dropped request shows no number rather than one
    // the other screens don't say (QA, 12 Nov: Home said 4 while the tab said 8 after a dropped request)
    counting: tasks.isLoading || decisions.isLoading || asks.isLoading || (oneOn && !shared.data),
    // couldn't load what waits: never «ما فيه شي ينتظرك»
    error: oneOn && (shared.isError || tasks.isError || decisions.isError),
    meId,
  };
}

/** the filters on «يحتاجك» (owner, 11 Nov, option 2) */
export type NeedGroup = 'requests' | 'reviews' | 'questions';
export const groupOf = (k: NeedRow['kind']): NeedGroup =>
  k === 'review' ? 'reviews' : k === 'ask' || k === 'comment' ? 'questions' : 'requests';

/** one «يحتاجك» for everything waiting on you: testers first (feature one_needs_you) */
export function useOneNeedsYouOn() {
  return (
    useQuery({
      queryKey: ['featureOn', 'one_needs_you'],
      queryFn: async () => (await supabase.rpc('feature_on' as never, { p_key: 'one_needs_you' } as never)).data === true,
      staleTime: 5 * 60_000,
    }).data === true
  );
}

export function NeedsYouList({ only, noDecisions = false }: { only?: NeedGroup; noDecisions?: boolean } = {}) {
  const { t } = useScreenT(NS);
  const qc = useQueryClient();
  const all = useNeedsYou();
  const meId = all.meId;
  // on «يحتاجك» (the Decisions tab) the decisions are the screen's own cards: the rest is listed here
  const rows = all.rows.filter((r) => (!only || groupOf(r.kind) === only) && !(noDecisions && r.decision));
  const resolve = useResolveDecision();
  const cancelFlow = useCancelFlow();
  const [state, setState] = useState<Record<string, 'busy' | 'done' | 'failed'>>({});

  const run = async (key: string, work: () => Promise<unknown>) => {
    setState((s) => ({ ...s, [key]: 'busy' }));
    try {
      await work();
      setState((s) => ({ ...s, [key]: 'done' }));
      void invalidateTaskData(qc);
      void qc.invalidateQueries({ queryKey: ['needsYouAsks'] });
    } catch (e) {
      console.error('needs-you action failed:', e instanceof Error ? e.message : String(e));
      setState((s) => ({ ...s, [key]: 'failed' }));
    }
  };
  const open = (r: NeedRow) => {
    // a cancel request stays until it's settled (Cancel or Keep), opening the task doesn't answer it
    if (r.alertIds?.length && r.kind !== 'cancel') {
      void (supabase as unknown as { from: (t: string) => any })
        .from('alerts')
        .update({ read_at: new Date().toISOString() })
        .in('id', r.alertIds)
        .then(() => qc.invalidateQueries({ queryKey: ['needsYouAsks'] }));
    }
    if (r.taskId) router.push({ pathname: '/14-task-detail', params: { id: r.taskId } });
    else router.push('/04-decisions');
  };
  const decide = (r: NeedRow, outcome: 'approved' | 'declined') =>
    run(r.key, () => resolve.mutateAsync({ decision: r.decision!, outcome, meId: meId! }));

  // inside «يحتاجك» the screen says when nothing waits (its own empty card)
  if (!rows.length && noDecisions) return <View>{cancelFlow.ui}</View>;
  if (!rows.length)
    return (
      // the «رجّعها» line stays even when the last row just left
      <View style={{ minHeight: 160 }}>
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
          <AppText color="greenText" weight="semibold">
            {t('empty')}
          </AppText>
        </Card>
        {cancelFlow.ui}
      </View>
    );

  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((r) => {
        const tone = TONE[r.kind];
        const st = state[r.key];
        const buttons: { label: string; primary?: boolean; onPress: () => void }[] =
          r.kind === 'review'
            ? [
                { label: t('approve'), primary: true, onPress: () => run(r.key, () => setTaskStatus(r.taskId!, 'done')) },
                { label: t('sendBack'), onPress: () => router.push({ pathname: '/15-review', params: { id: r.taskId! } }) },
              ]
            : r.kind === 'cancel'
              ? [
                  // the doer asked to cancel it: the giver settles it here (reviewer, 10 Nov)
                  // the same 6-second «رجّعها» as everywhere (the row itself already asked)
                  {
                    label: t('cancelIt'),
                    primary: true,
                    onPress: () =>
                      run(r.key, async () => {
                        if (!(await cancelFlow.cancelNow({ id: r.taskId!, title: r.title }))) throw new Error('cancel failed');
                      }),
                  },
                  { label: t('keepTask'), onPress: () => run(r.key, () => keepTask(r.taskId!)) },
                ]
              : r.decision
              ? [
                  { label: r.kind === 'busy' ? t('takeBack') : r.kind === 'askup' ? t('takeOn') : t('yes'), primary: true, onPress: () => decide(r, 'approved') },
                  { label: r.kind === 'busy' ? t('keepIt') : r.kind === 'askup' ? t('notNow') : t('no'), onPress: () => decide(r, 'declined') },
                ]
              : [{ label: t('openReply'), primary: true, onPress: () => open(r) }];
        return (
          <Card key={r.key} padding={spacing.md} style={{ gap: 6, opacity: st === 'done' ? 0.55 : 1 }}>
            <Pressable onPress={() => open(r)} accessibilityRole="link" style={{ gap: 3 }}>
              <View style={{ alignSelf: 'flex-start', backgroundColor: colors[tone.bg], borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                <AppText variant="caption" weight="extrabold" color={tone.fg}>
                  {t(r.kind)}
                </AppText>
              </View>
              <AppText weight="bold" numberOfLines={2}>
                {r.title}
              </AppText>
              {!!r.sub && (
                <AppText variant="caption" color="textMuted" numberOfLines={2}>
                  {r.sub}
                </AppText>
              )}
            </Pressable>
            {st === 'done' ? (
              <AppText variant="small" weight="bold" color="greenText">
                {t('done')}
              </AppText>
            ) : (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {buttons.map((b) => (
                  <Pressable
                    key={b.label}
                    onPress={b.onPress}
                    disabled={st === 'busy'}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      flex: 1,
                      minHeight: sizes.touch,
                      borderRadius: radius.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: b.primary ? colors.primary : colors.surface,
                      borderWidth: 1,
                      borderColor: b.primary ? colors.primary : colors.border,
                      opacity: pressed || st === 'busy' ? 0.7 : 1,
                    })}
                  >
                    <AppText variant="small" weight="extrabold" color={b.primary ? 'onDark' : 'text'}>
                      {b.label}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            )}
            {st === 'failed' && (
              <AppText variant="caption" color="red">
                {t('failed')}
              </AppText>
            )}
          </Card>
        );
      })}
      {cancelFlow.ui}
    </View>
  );
}
