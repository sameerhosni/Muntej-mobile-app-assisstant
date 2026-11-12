// Screen 04 · Decisions — see design/v2/html/Decisions.dc.html (Arabic: DecisionsAR.dc.html)
// Live data: decisions (pending). Approve / Decline / Move write decisions + tasks + activity_log.
// When there are no live decisions the empty state offers the design's two sample cards (local state only).
import { SetupBar } from '@/features/onboarding/SetupBar';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { CircleCheck, Clock, Hand } from 'lucide-react-native';
import { AppText, Card, Chip, FilterChips, Hero, IconBadge } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useDecisions, useMyProfile, useTeam } from '@/lib/api';
import { formatNumber, HOURLY_COST_SAR, MIN_PER_FOLLOWUP } from '@/features/home/value';
import { DEMO_TEAM } from '@/features/demo/team';
import { DecisionCard } from '@/features/decisions/DecisionCard';
import { TourTarget } from '@/features/walkthrough/TourTarget';
import { useWalkthrough } from '@/features/walkthrough/useWalkthrough';
import {
  DECISION_FILTERS,
  demoCards,
  FOLLOWUPS_PER_DECISION,
  liveCard,
  matchesDecisionFilter,
  type CardVM,
  type DecisionFilter,
  type Outcome,
  type Person,
} from '@/features/decisions/model';
import { useResolveDecision, useTaskOwners } from '@/features/decisions/useResolveDecision';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateTaskData } from '@/features/chat/api';
import { supabase } from '@/lib/supabase';
import { useAssignable } from '@/features/tasks/assignable';
import { NS } from '@/features/decisions/strings';
import { NEEDS_TAB_NS } from '@/features/decisions/needsStrings';
import { groupOf, NeedsYouList, useNeedsYou, type NeedGroup } from '@/features/tasks/NeedsYou';
import { router, type Href } from 'expo-router';

const DECISIONS_STEPS = [{ target: 'decisions.card', key: 'decisionsCard', demo: 'approve' as const }];

export default function DecisionsScreen() {
  const { t } = useScreenT(NS);
  useWalkthrough('decisions', DECISIONS_STEPS);
  const { lang } = useDirection();
  const decisions = useDecisions('pending');
  const team = useTeam();
  const me = useMyProfile();
  const resolve = useResolveDecision();

  const [sample, setSample] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  /** Cards resolved this session stay visible with their "Done" line after the live list drops them. */
  const [kept, setKept] = useState<Record<string, CardVM>>({});
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<DecisionFilter>('all');

  const rows = decisions.data ?? [];
  const owners = useTaskOwners(rows.map((d) => d.task_id).filter((x): x is string => !!x));
  const teamList = team.data ?? [];

  const cards: CardVM[] = useMemo(() => {
    if (sample) return demoCards(t, lang);
    const live = rows.map((d) => liveCard(d, { t, lang, team: teamList, owners: owners.data ?? {} }));
    const liveIds = new Set(live.map((c) => c.id));
    const extra = Object.values(kept).filter((c) => !liveIds.has(c.id));
    return [...live, ...extra].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [sample, rows, teamList, owners.data, kept, t, lang]);

  const filterOptions = DECISION_FILTERS.map((key) => ({
    key,
    label: t(`filter.${key}`),
    count: cards.filter((c) => matchesDecisionFilter(c, key)).length,
  }));
  const shown = cards.filter((c) => matchesDecisionFilter(c, filter));

  const mayGive = useAssignable();
  // «✓ خلصت أصلاً»: testers first, everyone once it goes live (the server checks the same switch)
  const finishOn = useQuery({
    queryKey: ['featureOn', 'decision_finish', me.data?.id],
    enabled: !!me.data?.id,
    queryFn: async () => {
      const { data } = await (supabase.rpc as unknown as (fn: string, a: object) => Promise<{ data: boolean | null }>)('feature_on', { p_key: 'decision_finish' });
      return data === true;
    },
  }).data === true;
  const candidates: Person[] = sample
    ? DEMO_TEAM.filter((p) => p.role === 'employee').map((p) => ({ id: p.id, full_name: p.name, full_name_ar: p.nameAr }))
    : // anyone you may give work to, managers too (Nouran Emira, a manager, wasn't offered) — but only them: your own
      // boss or another team's manager would be refused by the database after the tap (reviewer, 9 Nov)
      teamList.filter((p) => p.id !== me.data?.id && (p as { status?: string }).status !== 'deleted' && mayGive(p.id));

  // one «يحتاجك» (owner, 11 Nov, option 2): everything waiting on you here, with filters; decisions stay their cards
  const { t: tn } = useScreenT(NEEDS_TAB_NS);
  const needs = useNeedsYou();
  const oneOn = needs.oneOn;
  const [nf, setNf] = useState<'all' | NeedGroup | 'tools'>('all');
  const inGroup = (g: NeedGroup) => needs.rows.filter((r) => groupOf(r.kind) === g).length;
  const needFilters = (
    [
      ['all', needs.rows.length],
      ['requests', inGroup('requests')],
      ['reviews', inGroup('reviews')],
      ['questions', inGroup('questions')],
      ['tools', needs.tools],
    ] as const
  ).filter(([k, n]) => k === 'all' || n > 0);
  const needsSub = [
    inGroup('reviews') ? tn('s_reviews', { count: inGroup('reviews') }) : null,
    inGroup('requests') ? tn('s_requests', { count: inGroup('requests') }) : null,
    inGroup('questions') ? tn('s_questions', { count: inGroup('questions') }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const showCards = !oneOn || nf === 'all' || nf === 'requests';
  // never «ما فيه شي ينتظرك» while the list is still loading (R61: the owner's complaint again)
  const nothingAtAll = oneOn && !needs.loading && !needs.error && needs.rows.length === 0 && needs.tools === 0 && cards.length === 0;
  // the last one in a filter settled: back to «الكل», never a blank screen with no way back (reviewer, 11 Nov)
  const nfCount = nf === 'all' ? 1 : nf === 'tools' ? needs.tools : inGroup(nf);
  useEffect(() => {
    if (nf !== 'all' && nfCount === 0 && !needs.loading) setNf('all');
  }, [nf, nfCount, needs.loading]);

  const left = cards.filter((c) => !outcomes[c.id]).length;
  const followups = left * FOLLOWUPS_PER_DECISION;
  const minutes = followups * MIN_PER_FOLLOWUP;
  const headline =
    left === 0 ? t('headlineNone') : left === 1 ? t('headlineOne') : left === 2 ? t('headlineTwo') : t('headlineMany', { count: left });
  const loading = (decisions.isLoading || (oneOn && needs.loading)) && !sample;
  const [pulled, setPulled] = useState(false);
  const qc = useQueryClient();

  const onResolve = (card: CardVM, outcome: Outcome, moveTo?: Person) => {
    setFailed(false);
    if (card.sample || !card.raw) {
      setOutcomes((o) => ({ ...o, [card.id]: outcome }));
      return;
    }
    if (!me.data) {
      setFailed(true);
      return;
    }
    // the card answers the tap at once while the saves run behind it, and comes back only if they fail
    setKept((k) => ({ ...k, [card.id]: card }));
    setOutcomes((o) => ({ ...o, [card.id]: outcome }));
    // already done: it becomes yours and closes, all from this card (owner, 9 Nov)
    if (outcome === 'finished') {
      // its own server action and decision status (reviewer, 9 Nov): reusing 'approved' fired the "more time" /
      // "took it back" triggers, and closing as owner sent a manager with a boss into a review
      (supabase.rpc as unknown as (fn: string, a: object) => Promise<{ data: string | null; error: { message: string } | null }>)('finish_from_decision', {
        p_decision: card.raw.id,
      })
        .then(({ error }) => {
          if (error) throw new Error(error.message);
          void qc.invalidateQueries({ queryKey: ['decisions'] });
          return invalidateTaskData(qc);
        })
        .catch(() => {
          setOutcomes(({ [card.id]: _gone, ...rest }) => rest);
          setFailed(true);
        });
      return;
    }
    resolve.mutate(
      {
        decision: card.raw,
        outcome: outcome === 'declined' || outcome === 'kept' ? 'declined' : 'approved',
        meId: me.data.id,
        moveTo: outcome === 'moved' ? (moveTo ?? null) : null,
        ownerId: card.owner?.id ?? null,
      },
      {
        onError: () => {
          setOutcomes(({ [card.id]: _gone, ...rest }) => rest);
          setFailed(true);
        },
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        // the spinner only for a pull: a tap's save refreshes quietly behind the card (owner, 9 Nov: "loading again for
        // seconds after assigning")
        refreshControl={
          <RefreshControl
            refreshing={pulled && decisions.isRefetching}
            onRefresh={() => {
              setPulled(true);
              void decisions.refetch().finally(() => setPulled(false));
            }}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* one clean header (owner, 9 Nov, option 1): title + count, one line of what it saves, and only the filters
            that have something; room on the end side for Saree3's floating button so nothing covers the title */}
        <Hero overlap={20}>
          <View style={{ gap: spacing.sm, paddingEnd: 56 }}>
            <AppText variant="titleLg" color="onDark" style={{ fontSize: 26, lineHeight: 34 }}>
              {oneOn
                ? needs.counting || needs.error
                  ? tn('title')
                  : needs.count
                    ? tn('titleN', { n: formatNumber(needs.count, lang) })
                    : tn('none')
                : loading
                  ? t('heroPlain')
                  : left === 0
                    ? headline
                    : t('heroTitle', { n: formatNumber(left, lang) })}
            </AppText>
            {oneOn && !!needsSub && (
              <AppText variant="small" color="onDarkMuted">
                {needsSub}
              </AppText>
            )}
            {/* shown while the cards load too (their translation can take a few seconds) */}
            {!oneOn && (loading || left > 0) && (
              <AppText variant="small" color="onDarkMuted">
                {loading
                  ? t('heroTag')
                  : // Arabic counts by plural form: ساعة / ساعتين / 3 ساعات / 11 ساعة (reviewer, 9 Nov: «~1 ساعات»)
                    t('heroSub', { count: Math.max(1, Math.round(minutes / 60)) })}
              </AppText>
            )}
          </View>
          {oneOn && needFilters.length > 1 && (
            // Saree3 lights this up when he announces one «يحتاجك» (FEATURE_PLACES one_needs_you)
            <TourTarget id="needs.filters">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: spacing.md }}>
              {needFilters.map(([k, n]) => {
                const on = nf === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setNf(k)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={{ minHeight: sizes.touch, paddingHorizontal: spacing.lg, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? colors.surface : colors.glass }}
                  >
                    <AppText variant="small" weight="extrabold" color={on ? 'primary' : 'onDark'}>
                      {`${tn(`f_${k}`)} ${formatNumber(n, lang)}`}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
            </TourTarget>
          )}
          {!oneOn && cards.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: spacing.md }}>
              {filterOptions
                .filter((f) => f.key === 'all' || f.count > 0)
                .map((f) => {
                  const on = filter === f.key;
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => setFilter(f.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={{
                        minHeight: sizes.touch,
                        paddingHorizontal: spacing.lg,
                        borderRadius: radius.pill,
                        justifyContent: 'center',
                        backgroundColor: on ? colors.surface : colors.glass,
                      }}
                    >
                      <AppText variant="small" weight="extrabold" color={on ? 'primary' : 'onDark'}>
                        {`${f.label} ${formatNumber(f.count, lang)}`}
                      </AppText>
                    </Pressable>
                  );
                })}
            </ScrollView>
          )}
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -20, gap: spacing.lg }}>
          <SetupBar />
          {loading && (
            <Card elevation="raised" style={{ alignItems: 'center', paddingVertical: 28 }}>
              <ActivityIndicator color={colors.primary} />
            </Card>
          )}

          {(decisions.isError || (oneOn && needs.error)) && !sample && (
            <Card elevation="raised" tone="red">
              <AppText color="red" weight="semibold">
                {t('error')}
              </AppText>
            </Card>
          )}

          {!loading && !decisions.isError && cards.length === 0 && (!oneOn || nothingAtAll) && (
            <Card elevation="raised" style={{ alignItems: 'center', paddingVertical: 28, gap: spacing.md }}>
              <IconBadge size={52} round gradient="success">
                <CircleCheck color={colors.onDark} size={26} strokeWidth={2} />
              </IconBadge>
              <AppText variant="section" align="center">
                {t('emptyTitle')}
              </AppText>
              <AppText color="textMuted" align="center">
                {t('emptyBody')}
              </AppText>
              <Pressable
                onPress={() => setSample(true)}
                accessibilityRole="button"
                style={{ minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: spacing.lg }}
              >
                <AppText variant="small" weight="bold" color="primary">
                  {t('showSample')}
                </AppText>
              </Pressable>
            </Card>
          )}


          {cards.length > 0 && shown.length === 0 && (
            <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg }}>
              <AppText color="textMuted" align="center">
                {t('nothingHere')}
              </AppText>
              <Chip label={t('showAll')} onPress={() => setFilter('all')} />
            </View>
          )}

          {(showCards ? shown : []).map((c, i) => {
            const card = (
              <DecisionCard
                key={c.id}
                card={c}
                raised={i === 0}
                outcome={outcomes[c.id]}
                candidates={candidates}
                canFinish={finishOn}
                onResolve={(o, p) => onResolve(c, o, p)}
              />
            );
            // the first card is the one Saree3's walkthrough lights up
            return i === 0 ? (
              <TourTarget key={c.id} id="decisions.card">
                {card}
              </TourTarget>
            ) : (
              card
            );
          })}

          {/* the rest of what waits on you: finished work, cancel requests, questions, comments */}
          {oneOn && nf !== 'tools' && <NeedsYouList only={nf === 'all' ? undefined : nf} noDecisions />}
          {/* tasks found in your tools: their own filter, not in the count */}
          {oneOn && (nf === 'all' || nf === 'tools') && needs.tools > 0 && (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <AppText weight="bold" style={{ flex: 1 }}>
                {tn('toolsCard', { count: needs.tools })}
              </AppText>
              <Chip label={tn('toolsOpen')} onPress={() => router.push('/42-incoming' as Href)} />
            </Card>
          )}

          {failed && (
            <AppText variant="small" color="red" align="center">
              {t('failed')}
            </AppText>
          )}

          {cards.length > 0 && left === 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: sizes.touch }}>
              <CircleCheck color={colors.green} size={18} strokeWidth={2.2} />
              <AppText weight="bold" color="greenText">
                {t('allClear')}
              </AppText>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function HeroPill({ bg, icon, label }: { bg: ColorToken; icon: ReactNode; label: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        borderRadius: radius.pill,
        paddingVertical: 4,
        paddingStart: 4,
        paddingEnd: spacing.md,
      }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors[bg], alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <AppText variant="caption" weight="bold" color="onDark">
        {label}
      </AppText>
    </View>
  );
}
