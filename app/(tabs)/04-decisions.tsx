// Screen 04 · Decisions — see design/v2/html/Decisions.dc.html (Arabic: DecisionsAR.dc.html)
// Live data: decisions (pending). Approve / Decline / Move write decisions + tasks + activity_log.
// When there are no live decisions the empty state offers the design's two sample cards (local state only).
import { SetupBar } from '@/features/onboarding/SetupBar';
import { useMemo, useState, type ReactNode } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';
import { invalidateTaskData, setTaskStatus } from '@/features/chat/api';
import { NS } from '@/features/decisions/strings';

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

  const candidates: Person[] = sample
    ? DEMO_TEAM.filter((p) => p.role === 'employee').map((p) => ({ id: p.id, full_name: p.name, full_name_ar: p.nameAr }))
    : // anyone you may give work to, managers too (Nouran Emira, a manager, wasn't offered)
      teamList.filter((p) => p.id !== me.data?.id && (p as { status?: string }).status !== 'deleted');

  const left = cards.filter((c) => !outcomes[c.id]).length;
  const followups = left * FOLLOWUPS_PER_DECISION;
  const minutes = followups * MIN_PER_FOLLOWUP;
  const headline =
    left === 0 ? t('headlineNone') : left === 1 ? t('headlineOne') : left === 2 ? t('headlineTwo') : t('headlineMany', { count: left });
  const loading = decisions.isLoading && !sample;
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
      const meP = { id: me.data.id, full_name: me.data.full_name, full_name_ar: me.data.full_name_ar };
      resolve
        .mutateAsync({ decision: card.raw, outcome: 'approved', meId: me.data.id, moveTo: card.owner ? null : meP, ownerId: card.owner?.id ?? null })
        .then(() => setTaskStatus(card.raw!.task_id!, 'done'))
        .then(() => invalidateTaskData(qc))
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
              {loading ? ' ' : left === 0 ? headline : t('heroTitle', { n: formatNumber(left, lang) })}
            </AppText>
            {!loading && left > 0 && (
              <AppText variant="small" color="onDarkMuted">
                {t('heroSub', { h: formatNumber(Math.max(1, Math.round(minutes / 60)), lang), sar: formatNumber(Math.round((minutes / 60) * HOURLY_COST_SAR), lang) })}
              </AppText>
            )}
          </View>
          {cards.length > 0 && (
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
                        minHeight: 38,
                        paddingHorizontal: spacing.lg,
                        borderRadius: radius.pill,
                        justifyContent: 'center',
                        backgroundColor: on ? colors.surface : 'rgba(255,255,255,0.16)',
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

          {decisions.isError && !sample && (
            <Card elevation="raised" tone="red">
              <AppText color="red" weight="semibold">
                {t('error')}
              </AppText>
            </Card>
          )}

          {!loading && !decisions.isError && cards.length === 0 && (
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

          {shown.map((c, i) => {
            const card = (
              <DecisionCard
                key={c.id}
                card={c}
                raised={i === 0}
                outcome={outcomes[c.id]}
                candidates={candidates}
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
