// Screen 19 · Workspaces — see design/v2/html/Workspaces.dc.html (Arabic: WorkspacesAR.dc.html)
// Live data: workspaces + workspace_members (RLS: owner or member), tasks (health, task count, wins this week),
// activity_log (hours / SAR saved this week). Points per workspace are demo until the points tables exist.
// Tap a workspace → /21-achievements?workspace=<id> (prototype tip t19).
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle, Banknote, Check, ChevronLeft, Clock, Hand, ListChecks, Plus, RotateCw, Sparkles, Users } from 'lucide-react-native';
import {
  AppText,
  Avatar,
  BottomCTA,
  BOTTOM_CTA_SPACE,
  Card,
  Chip,
  FilterChips,
  Gradient,
  Hero,
  IconBadge,
  IconButton,
  PointsPill,
  SearchField,
  StatTile,
} from '@/components/ui';
import { matchesSearch } from '@/lib/search';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useActivity, useTasks, useTeam } from '@/lib/api';
import { formatNumber, sarSaved } from '@/features/home/value';
import { firstName, personName, startOfWeek } from '@/features/dashboard/metrics';
import { useWorkspaces, workspaceName } from '@/features/workspaces/useWorkspaces';
import {
  activityMinutes,
  buildCards,
  matchesWorkspaceFilter,
  suggestion,
  WORKSPACE_FILTERS,
  type WorkspaceCardVM,
  type WorkspaceFilter,
} from '@/features/workspaces/model';
import { wsTone } from '@/features/workspaces/color';
import { NS } from '@/features/workspaces/strings';

const MAX_AVATARS = 3;

export default function WorkspacesScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const workspaces = useWorkspaces();
  const tasks = useTasks();
  const activity = useActivity(1000);
  const team = useTeam();

  const cards = useMemo(
    () => buildCards(workspaces.data ?? [], tasks.data ?? [], activity.data ?? []),
    [workspaces.data, tasks.data, activity.data],
  );
  const weekHours = useMemo(() => {
    const from = startOfWeek().getTime();
    return (activity.data ?? []).reduce((m, a) => (new Date(a.created_at).getTime() >= from ? m + activityMinutes(a) : m), 0) / 60;
  }, [activity.data]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<WorkspaceFilter>('all');
  const searched = useMemo(() => cards.filter((c) => matchesSearch(query, c.ws.name, c.ws.name_ar)), [cards, query]);
  const filterOptions = WORKSPACE_FILTERS.map((key) => ({
    key,
    label: t(`filter.${key}`),
    count: searched.filter((c) => matchesWorkspaceFilter(c, key)).length,
  }));
  const shown = searched.filter((c) => matchesWorkspaceFilter(c, filter));
  const resetFilters = () => {
    setQuery('');
    setFilter('all');
  };

  const tip = useMemo(() => suggestion(cards, tasks.data ?? [], team.data ?? []), [cards, tasks.data, team.data]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const refreshing = workspaces.isRefetching || tasks.isRefetching || activity.isRefetching;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: BOTTOM_CTA_SPACE + 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { workspaces.refetch(); tasks.refetch(); activity.refetch(); }}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Hero overlap={24}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconButton variant="glass" label={t('back')} onPress={back}>
              <ChevronLeft color={colors.onDark} size={22} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </IconButton>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AppText variant="titleLg" color="onDark" numberOfLines={1} style={{ fontSize: 28, lineHeight: 34 }}>
                {t('title')}
              </AppText>
              <AppText color="onDarkMuted" numberOfLines={1}>
                {t('subtitle')}
              </AppText>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile variant="glass" iconBg="primaryLight" icon={<Clock color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={t('hours', { h: formatNumber(weekHours, lang, 1) })} label={t('savedWeek')} />
            <StatTile variant="glass" iconBg="green" icon={<Banknote color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={formatNumber(sarSaved(weekHours), lang)} label={t('sarWeek')} />
            <StatTile variant="glass" iconBg="orange" icon={<Hand color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={formatNumber(0, lang)} label={t('chases')} />
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -24, gap: spacing.lg }}>
          {workspaces.isError && (
            <Card tone="red" padding={spacing.lg}>
              <AppText variant="small" color="red">{t('error')}</AppText>
            </Card>
          )}
          {!workspaces.isLoading && !workspaces.isError && cards.length === 0 && (
            <Card elevation="raised">
              <AppText color="textMuted">{t('empty')}</AppText>
            </Card>
          )}
          {cards.length > 0 && (
            <View style={{ gap: spacing.md }}>
              <SearchField value={query} onChangeText={setQuery} placeholder={t('search')} clearLabel={t('clearSearch')} />
              <FilterChips options={filterOptions} value={filter} onChange={setFilter} />
            </View>
          )}
          {cards.length > 0 && shown.length === 0 && (
            <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg }}>
              <AppText color="textMuted" align="center">
                {t('nothingHere')}
              </AppText>
              <Chip label={t('showAll')} onPress={resetFilters} />
            </View>
          )}
          {shown.map((c) => {
            // Keep each workspace's colour stable while filtering: index in the full list.
            const i = cards.indexOf(c);
            return <WorkspaceCard key={c.ws.id} c={c} index={i} first={i === 0} />;
          })}

          {tip && (
            <Pressable
              onPress={() => router.push('/11-load-radar')}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48,
                backgroundColor: colors.surface, borderRadius: radius.tile, paddingVertical: spacing.sm,
                paddingStart: spacing.sm, paddingEnd: spacing.lg, boxShadow: shadows.tile, opacity: pressed ? 0.88 : 1,
              })}
            >
              <IconBadge size={32} gradient="avatarBlue">
                <Sparkles color={colors.onDark} size={16} strokeWidth={2} />
              </IconBadge>
              <AppText variant="small" weight="semibold" color="textSoft" style={{ flex: 1 }}>
                {t('suggest', {
                  n: formatNumber(tip.n, lang),
                  ws: workspaceName(tip.ws, lang),
                  name: firstName(personName(tip.person, lang)),
                })}
              </AppText>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <BottomCTA
        primary={{
          label: t('newWorkspace'),
          onPress: () => router.push('/20-new-workspace'),
          icon: <Plus color={colors.onDark} size={20} strokeWidth={2} />,
        }}
        secondary={{
          label: t('agents'),
          onPress: () => router.push('/22-agents'),
          icon: <RotateCw color={colors.primary} size={18} strokeWidth={2} />,
        }}
      />
    </View>
  );
}

function WorkspaceCard({ c, index, first }: { c: WorkspaceCardVM; index: number; first: boolean }) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const tone = wsTone(c.ws.color, index);
  const name = workspaceName(c.ws, lang);
  const shown = c.ws.members.slice(0, MAX_AVATARS);
  const extra = c.ws.members.length - shown.length;
  const healthLabel = c.attention ? t('stuck', { n: formatNumber(c.stuck, lang) }) : t('onTrack');

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/21-achievements', params: { workspace: c.ws.id } })}
      accessibilityRole="button"
      accessibilityLabel={t('cardA11y', {
        name,
        members: formatNumber(c.members, lang),
        tasks: formatNumber(c.tasks, lang),
        wins: formatNumber(c.winsThisWeek, lang),
        health: healthLabel,
      })}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.xxl,
        gap: spacing.lg,
        overflow: 'hidden',
        boxShadow: first ? shadows.raised : shadows.card,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Gradient name={tone.gradient} style={{ position: 'absolute', start: 0, top: 0, bottom: 0, width: 4 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <Gradient name={tone.gradient} style={{ width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}>
          <AppText weight="extrabold" color="onDark" style={{ fontSize: 18 }}>
            {name.trim().charAt(0).toUpperCase()}
          </AppText>
        </Gradient>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <AppText variant="section" numberOfLines={1} style={{ fontSize: 18 }}>
            {name}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Meta icon={<Users color={colors.textMuted} size={13} strokeWidth={2.2} />} value={formatNumber(c.members, lang)} label={t('members')} />
            <Meta icon={<ListChecks color={colors.textMuted} size={13} strokeWidth={2.2} />} value={formatNumber(c.tasks, lang)} label={t('tasks')} />
            <Meta icon={<Check color={colors.green} size={13} strokeWidth={2.4} />} value={formatNumber(c.winsThisWeek, lang)} label={t('wins')} green />
          </View>
        </View>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: 5,
            borderRadius: radius.pill, backgroundColor: c.attention ? colors.amberTint : colors.greenTint,
          }}
        >
          {c.attention ? (
            <AlertTriangle color={colors.amberText} size={12} strokeWidth={2.4} />
          ) : (
            <Check color={colors.green} size={12} strokeWidth={2.6} />
          )}
          <AppText variant="caption" weight="bold" color={c.attention ? 'amberStrong' : 'green'} numberOfLines={1}>
            {healthLabel}
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          {shown.map((m, i) => (
            <View key={m.profile_id} style={{ marginStart: i === 0 ? 0 : -8 }}>
              <Avatar name={personName(m.profile, lang) || '?'} size={30} ring />
            </View>
          ))}
          {extra > 0 && (
            <View
              style={{
                width: 30, height: 30, borderRadius: 15, marginStart: shown.length ? -8 : 0, borderWidth: 2, borderColor: colors.surface,
                backgroundColor: colors[tone.tint], alignItems: 'center', justifyContent: 'center',
              }}
            >
              <AppText variant="micro" weight="bold" color={tone.solid}>
                {t('more', { n: formatNumber(extra, lang) })}
              </AppText>
            </View>
          )}
        </View>
        <PointsPill size="sm" label={formatNumber(c.points, lang)} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primaryTint, borderRadius: radius.pill, paddingVertical: 3, paddingStart: 4, paddingEnd: 9 }}>
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Clock color={colors.onDark} size={11} strokeWidth={2.6} />
          </View>
          <AppText variant="caption" weight="bold" color="primary" numberOfLines={1}>
            {t('hSaved', { h: formatNumber(c.hoursSaved, lang, 1) })}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

function Meta({ icon, value, label, green }: { icon: ReactNode; value: string; label: string; green?: boolean }) {
  return (
    <View accessibilityLabel={`${label} ${value}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {icon}
      <AppText variant="caption" weight="bold" color={green ? 'green' : 'textMuted'}>
        {value}
      </AppText>
    </View>
  );
}
