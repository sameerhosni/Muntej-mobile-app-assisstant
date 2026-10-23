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
  const [busyId, setBusyId] = useState<string | null>(null);
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
    : teamList.filter((p) => p.role === 'employee');

  const left = cards.filter((c) => !outcomes[c.id]).length;
  const followups = left * FOLLOWUPS_PER_DECISION;
  const minutes = followups * MIN_PER_FOLLOWUP;
  const headline =
    left === 0 ? t('headlineNone') : left === 1 ? t('headlineOne') : left === 2 ? t('headlineTwo') : t('headlineMany', { count: left });
  const loading = decisions.isLoading && !sample;

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
    setBusyId(card.id);
    resolve.mutate(
      {
        decision: card.raw,
        outcome: outcome === 'declined' || outcome === 'kept' ? 'declined' : 'approved',
        meId: me.data.id,
        moveTo: outcome === 'moved' ? (moveTo ?? null) : null,
        ownerId: card.owner?.id ?? null,
      },
      {
        onSuccess: () => {
          setKept((k) => ({ ...k, [card.id]: card }));
          setOutcomes((o) => ({ ...o, [card.id]: outcome }));
        },
        onError: () => setFailed(true),
        onSettled: () => setBusyId(null),
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={decisions.isRefetching} onRefresh={() => decisions.refetch()} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <Hero overlap={36}>
          <View style={{ gap: spacing.md }}>
            <AppText variant="titleLg" color="onDark" style={{ fontSize: 28, lineHeight: 36 }}>
              {loading ? ' ' : headline}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <HeroPill
                bg="orange"
                icon={<Hand color={colors.onDark} size={13} strokeWidth={2.2} />}
                label={t('savesFollowups', { n: formatNumber(followups, lang) })}
              />
              <HeroPill
                bg="primaryLight"
                icon={<Clock color={colors.onDark} size={13} strokeWidth={2.2} />}
                label={t('timeValue', { min: formatNumber(minutes, lang), sar: formatNumber(Math.round((minutes / 60) * HOURLY_COST_SAR), lang) })}
              />
            </View>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -36, gap: spacing.lg }}>
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

          {cards.length > 0 && <FilterChips options={filterOptions} value={filter} onChange={setFilter} />}

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
                busy={busyId === c.id}
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
