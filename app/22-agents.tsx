// Screen 22 · Agents — see design/v2/html/Agents.dc.html (Arabic: AgentsAR.dc.html)
// Live data: agents (own rows, RLS) + agent_runs (via ownership). Toggles save `enabled` optimistically
// (src/features/agents/useAgents). Hours/SAR tiles are estimates (2 h per active agent per month).
import { useState, type ComponentType } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlarmClock,
  Banknote,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hand,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Star,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Button, Card, Chip, FilterChips, Hero, IconBadge, IconButton, SearchField, StatTile, Toggle } from '@/components/ui';
import { matchesSearch } from '@/lib/search';
import { colors, radius, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import type { Agent } from '@/lib/api';
import { formatNumber, HOURLY_COST_SAR } from '@/features/home/value';
import { NS } from '@/features/agents/strings';
import { buildRecipe, describeWhen, kindOf, parseRecipe, type AgentKind, type Recipe, type Tr } from '@/features/agents/recipe';
import { HOURS_PER_AGENT_MONTH, TEMPLATE_KEYS, useAgents, type AgentRun, type TemplateKey } from '@/features/agents/useAgents';

const KIND_STYLE: Record<AgentKind, { Icon: ComponentType<LucideProps>; bg: ColorToken; fg: ColorToken }> = {
  nudge: { Icon: Send, bg: 'primaryTint', fg: 'primary' },
  report: { Icon: ChartColumn, bg: 'purpleTint', fg: 'purple' },
  escalate: { Icon: AlarmClock, bg: 'redTint', fg: 'red' },
  email: { Icon: Mail, bg: 'greenTint', fg: 'green' },
  kudos: { Icon: Star, bg: 'orangeTint', fg: 'orange' },
};

type AgentFilter = 'all' | 'on' | 'off';
const AGENT_FILTERS: AgentFilter[] = ['all', 'on', 'off'];
const matchesAgentFilter = (a: Agent, f: AgentFilter) => f === 'all' || a.enabled === (f === 'on');

const DOW_KEYS =['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
/** Show ready-made agents while the manager has fewer than this many. */
const SUGGEST_BELOW = 3;

export default function AgentsScreen() {
  const { t } = useScreenT(NS);
  const tr: Tr = (k, o) => t(k, o) as string;
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const { agents, runs, ready, isLoading, isError, isRefetching, refetch, saveError, setEnabled } = useAgents();

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  const active = agents.filter((a) => a.enabled).length;
  const totalRuns = agents.reduce((sum, a) => sum + a.run_count, 0);
  const hours = active * HOURS_PER_AGENT_MONTH;

  // Search by name and the plain-language instruction (agents have no separate description column).
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AgentFilter>('all');
  const searched = agents.filter((a) => matchesSearch(query, a.name, a.prompt));
  const filterOptions = AGENT_FILTERS.map((key) => ({
    key,
    label: t(`filter.${key}`),
    count: searched.filter((a) => matchesAgentFilter(a, key)).length,
  }));
  const shown = searched.filter((a) => matchesAgentFilter(a, filter));
  const resetFilters = () => {
    setQuery('');
    setFilter('all');
  };

  const usedTemplates =new Set(agents.map((a) => parseRecipe(a.recipe)?.template).filter(Boolean));
  const suggestions = ready && agents.length < SUGGEST_BELOW ? TEMPLATE_KEYS.filter((k) => !usedTemplates.has(k)) : [];

  const lastLabel = (a: Agent, recipe: Recipe | null, agentRuns: AgentRun[]) => {
    if (recipe?.trigger.type === 'event' && a.run_count > 0) return t('last.count', { n: formatNumber(a.run_count, lang) });
    if (a.last_run_at) {
      const d = new Date(a.last_run_at);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      if (d >= start) return t('last.today');
      const days = Math.ceil((start.getTime() - d.getTime()) / 86_400_000);
      if (days < 7) return t('last.day', { day: t(`days.${DOW_KEYS[d.getDay()]}`) });
      return t('last.ago', { n: formatNumber(days, lang) });
    }
    return agentRuns.some((r) => r.dry_run) ? t('last.tested') : t('last.never');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
      >
        <Hero overlap={22}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg }}>
            <IconButton variant="glass" label={t('back')} onPress={goBack}>
              <BackIcon color={colors.onDark} size={22} strokeWidth={2} />
            </IconButton>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="titleLg" color="onDark" style={{ fontSize: 28, lineHeight: 34 }}>
                {t('title')}
              </AppText>
              <AppText color="onDarkMuted">{t('subtitle')}</AppText>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 5, marginTop: 6 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: colors.glass,
                  borderWidth: 1,
                  borderColor: colors.mint,
                  borderRadius: radius.pill,
                  paddingHorizontal: 9,
                  paddingVertical: 3,
                }}
              >
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.mint }} />
                <AppText variant="caption" weight="bold" color="onDark" numberOfLines={1}>
                  {t('on', { n: formatNumber(active, lang) })}
                </AppText>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: colors.glass,
                  borderWidth: 1,
                  borderColor: colors.glassBorder,
                  borderRadius: radius.pill,
                  paddingHorizontal: 9,
                  paddingVertical: 3,
                }}
              >
                <RefreshCw color={colors.onDark} size={12} strokeWidth={2.4} />
                <AppText variant="caption" weight="bold" color="onDark" numberOfLines={1}>
                  {t('runs', { n: formatNumber(totalRuns, lang) })}
                </AppText>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile
              variant="glass"
              iconBg="primaryLight"
              icon={<Clock color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={t('savedValue', { n: formatNumber(hours, lang) })}
              label={t('saved')}
            />
            <StatTile
              variant="glass"
              iconBg="green"
              icon={<Banknote color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={formatNumber(hours * HOURLY_COST_SAR, lang)}
              label={t('sarSaved')}
            />
            <StatTile
              variant="glass"
              iconBg="orange"
              icon={<Hand color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={formatNumber(0, lang)}
              label={t('nudges')}
            />
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -22, gap: spacing.sm }}>
          {isLoading && (
            <Card padding={spacing.lg} style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.md }}>
              <ActivityIndicator color={colors.primary} />
              <AppText color="textMuted">{t('loading')}</AppText>
            </Card>
          )}
          {isError && (
            <Card tone="red" padding={spacing.lg}>
              <AppText color="red">{t('error')}</AppText>
            </Card>
          )}
          {saveError && (
            <Card tone="amber" padding={spacing.lg}>
              <AppText variant="small" color="amberStrong">
                {t('saveError')}
              </AppText>
            </Card>
          )}
          {ready && agents.length === 0 && (
            <Card padding={spacing.lg}>
              <AppText color="textMuted">{t('empty')}</AppText>
            </Card>
          )}

          {agents.length > 0 && (
            <View style={{ gap: spacing.md, marginBottom: spacing.xs }}>
              <SearchField value={query} onChangeText={setQuery} placeholder={t('search')} clearLabel={t('clearSearch')} />
              <FilterChips options={filterOptions} value={filter} onChange={setFilter} />
            </View>
          )}
          {agents.length > 0 && shown.length === 0 && (
            <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg }}>
              <AppText color="textMuted" align="center">
                {t('nothingHere')}
              </AppText>
              <Chip label={t('showAll')} onPress={resetFilters} />
            </View>
          )}

          {shown.map((a) => {
            const recipe = parseRecipe(a.recipe);
            const st = KIND_STYLE[kindOf(recipe)];
            const on = a.enabled;
            const when = recipe ? describeWhen(recipe, tr) : t('eventShort');
            const last = lastLabel(
              a,
              recipe,
              runs.filter((r) => r.agent_id === a.id),
            );
            return (
              <Card
                key={a.id}
                padding={spacing.xl}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: 11, opacity: on ? 1 : 0.65 }}
              >
                <IconBadge size={40} bg={on ? st.bg : 'chip'}>
                  <st.Icon color={colors[on ? st.fg : 'textFaint']} size={20} strokeWidth={1.8} />
                </IconBadge>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <AppText weight="bold" numberOfLines={2} style={{ lineHeight: 18 }}>
                    {a.name}
                  </AppText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Clock color={colors.textMuted} size={11} strokeWidth={2.4} />
                    <AppText variant="micro" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {`${when} · ${last}`}
                    </AppText>
                  </View>
                </View>
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <Toggle
                    value={on}
                    onValueChange={(next) => setEnabled(a.id, next)}
                    accessibilityLabel={t('toggleLabel', { name: a.name })}
                  />
                  <AppText variant="micro" weight="extrabold" color="green" numberOfLines={1}>
                    {t('perAgent', { n: formatNumber(HOURS_PER_AGENT_MONTH, lang) })}
                  </AppText>
                </View>
              </Card>
            );
          })}

          {suggestions.length > 0 && (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <View style={{ gap: 2 }}>
                <AppText variant="section">{t('suggested')}</AppText>
                <AppText variant="caption" color="textMuted">
                  {t('suggestedHint')}
                </AppText>
              </View>
              {suggestions.map((k) => (
                <TemplateCard key={k} k={k} tr={tr} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.screen,
          paddingTop: spacing.lg,
          paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.sm,
          backgroundColor: colors.bg,
        }}
      >
        <Button
          label={t('newAgent')}
          icon={<Sparkles color={colors.onDark} size={20} strokeWidth={1.8} />}
          onPress={() => router.push('/23-new-agent')}
        />
      </View>
    </View>
  );
}

function TemplateCard({ k, tr }: { k: TemplateKey; tr: Tr }) {
  const name = tr(`tpl.${k}.name`);
  const recipe = buildRecipe(tr(`tpl.${k}.prompt`), k);
  const st = KIND_STYLE[kindOf(recipe)];
  const add = () => router.push({ pathname: '/23-new-agent', params: { template: k } });
  return (
    <Card
      padding={spacing.xl}
      elevation="flat"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        paddingVertical: 11,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: colors.borderDashed,
      }}
    >
      <IconBadge size={40} bg={st.bg}>
        <st.Icon color={colors[st.fg]} size={20} strokeWidth={1.8} />
      </IconBadge>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <AppText weight="bold" numberOfLines={2} style={{ lineHeight: 18 }}>
          {name}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Clock color={colors.textMuted} size={11} strokeWidth={2.4} />
          <AppText variant="micro" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {describeWhen(recipe, tr)}
          </AppText>
        </View>
      </View>
      <Pressable
        onPress={add}
        accessibilityRole="button"
        accessibilityLabel={tr('addLabel', { name })}
        style={({ pressed }) => ({
          minHeight: 44,
          minWidth: 64,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.pill,
          backgroundColor: colors.primaryTint,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Plus color={colors.primary} size={16} strokeWidth={2.4} />
        <AppText variant="small" weight="bold" color="primary">
          {tr('add')}
        </AppText>
      </Pressable>
    </Card>
  );
}
