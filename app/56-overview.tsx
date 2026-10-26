// Screen 56 · Work overview — no mockup; a client's "COO Office" dashboard, made to fit every company. v2 light style
// per design/TOKENS.md. Preview: reached only from More (managers) until the owner confirms it.
// Team chips filter everything (a team = one of your direct reports and everyone under them). 4 headline numbers,
// "Needs follow-up" (decisions · late · quiet · no owner · no deadline · to review), by team / work status / priority,
// my work and follow-ups, and what moved since a day you pick. Every number opens the tasks behind it.
// Numbers: src/features/overview/model.ts.
import { useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, RefreshCw } from 'lucide-react-native';
import { AppText, Button, Card, Chip, IconButton } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useDecisions, useMyProfile, useTasks, type TaskWithPeople } from '@/lib/api';
import { formatDue } from '@/features/capture/format';
import { displayName, useOrg } from '@/features/org/model';
import { startOfDay, startOfWeek, DAY_MS } from '@/features/dashboard/metrics';
import { computeOverview, DIRECT, type Metric } from '@/features/overview/model';
import { BarRow, StackBar } from '@/features/overview/Bars';
import { OV_NS } from '@/features/overview/strings';

type Since = 'today' | 'week' | '7' | '30';
const sinceDate = (s: Since) =>
  s === 'today' ? startOfDay() : s === 'week' ? startOfWeek() : new Date(startOfDay().getTime() - (s === '7' ? 7 : 30) * DAY_MS);

export default function OverviewScreen() {
  const { t } = useScreenT(OV_NS);
  const { isRTL, lang } = useDirection();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const me = useMyProfile();
  const tasks = useTasks();
  const org = useOrg();
  const decisions = useDecisions('pending');
  const [team, setTeam] = useState('all');
  const [since, setSince] = useState<Since>('week');
  const [list, setList] = useState<{ title: string; items: TaskWithPeople[] } | null>(null);

  const meId = me.data?.id ?? '';
  const ov = useMemo(
    () =>
      computeOverview({
        tasks: tasks.data ?? [],
        people: org.data ?? [],
        meId,
        decisions: decisions.data?.length ?? 0,
        team,
        since: sinceDate(since),
      }),
    [tasks.data, org.data, meId, decisions.data, team, since],
  );
  const L = ov.lists;
  const teamName = (key: string) => {
    if (key === DIRECT) return t('direct');
    const p = (org.data ?? []).find((x) => x.id === key);
    return p ? t('teamOf', { name: displayName(p, lang).split(' ')[0] }) : '';
  };
  const show = (m: Metric, title: string) => setList({ title, items: L[m] });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/44-more' as Href));
  const refresh = () => {
    tasks.refetch();
    decisions.refetch();
    org.refetch();
  };
  const now = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Riyadh',
  }).format(new Date());
  const teamsWithWork = ov.teams.filter((x) => x.open > 0);
  const maxTeam = Math.max(1, ...ov.teams.map((x) => x.open));
  const prMax = Math.max(1, L.pr_urgent.length, L.pr_high.length, L.pr_medium.length, L.pr_low.length);
  const statusParts = [
    { key: 'st_done' as const, label: t('done'), color: colors.green },
    { key: 'st_progress' as const, label: t('progress'), color: colors.primary },
    { key: 'st_waiting' as const, label: t('waiting'), color: colors.amber },
    { key: 'st_other' as const, label: t('other'), color: colors.textFaint },
  ];
  const statusTotal = statusParts.reduce((n, p) => n + L[p.key].length, 0);

  const panel = { flex: wide ? 1 : undefined, minWidth: 0 };
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.screen, paddingTop: 20, gap: spacing.lg, paddingBottom: 48, maxWidth: 1200, width: '100%', alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={tasks.isRefetching} onRefresh={refresh} tintColor={colors.primary} />}
      >
        {/* header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconButton label={t('back')} onPress={back}>
            <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={flip} />
          </IconButton>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppText variant="titleLg" numberOfLines={1}>
                {t('title')}
              </AppText>
              <Chip label={t('preview')} tone="primary" />
            </View>
            <AppText variant="caption" color="textMuted">
              {t('now', { date: now })}
            </AppText>
          </View>
          <IconButton label="refresh" onPress={refresh}>
            <RefreshCw color={colors.textSoft} size={18} />
          </IconButton>
        </View>

        {/* team filter */}
        {ov.teams.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            <Chip label={t('all')} selected={team === 'all'} onPress={() => setTeam('all')} />
            {ov.teams.map((x) => (
              <Chip key={x.key} label={`${teamName(x.key)} · ${x.open}`} selected={team === x.key} onPress={() => setTeam(x.key)} />
            ))}
          </ScrollView>
        )}

        {/* 4 headline numbers */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Big tint="primary" label={t('open')} value={L.open.length} sub={t('openSub', { count: Math.max(1, teamsWithWork.length) })} onPress={() => show('open', t('open'))} />
          <Big tint="amber" label={t('urgent')} value={L.urgent.length} sub={t('urgentSub')} onPress={() => show('urgent', t('urgent'))} />
          <Big tint="red" label={t('late')} value={L.late.length} sub={t('lateSub')} onPress={() => show('late', t('late'))} />
          <Big tint="purple" label={t('approval')} value={L.approval.length + ov.decisions} sub={t('approvalSub')} onPress={() => show('approval', t('approval'))} />
        </View>

        {/* needs follow-up */}
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="section" style={{ flex: 1 }}>
              {t('followUp')}
            </AppText>
            <Chip label={String(ov.followUp)} tone={ov.followUp ? 'primary' : 'neutral'} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Small label={t('decision')} value={ov.decisions} onPress={() => router.push('/04-decisions')} />
            <Small label={t('late')} value={L.late.length} tone="red" onPress={() => show('late', t('late'))} />
            <Small label={t('quiet')} value={L.quiet.length} onPress={() => show('quiet', t('quiet'))} />
            <Small label={t('noOwner')} value={L.noOwner.length} onPress={() => show('noOwner', t('noOwner'))} />
            <Small label={t('noDue')} value={L.noDue.length} onPress={() => show('noDue', t('noDue'))} />
            <Small label={t('toReview')} value={L.toReview.length} onPress={() => show('toReview', t('toReview'))} />
          </View>
        </Card>

        {/* by team · work status · priority */}
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: spacing.md }}>
          <Panel title={t('byTeam')} badge={String(L.open.length)} style={panel}>
            {ov.teams.map((x) => (
              <BarRow key={x.key} label={teamName(x.key)} value={x.open} max={maxTeam} color={colors.primary} onPress={() => setTeam(x.key)} />
            ))}
          </Panel>
          <Panel title={t('status')} badge={String(statusTotal)} style={panel}>
            <StackBar parts={statusParts.map((p) => ({ value: L[p.key].length, color: p.color }))} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {statusParts.map((p) => (
                <Pressable
                  key={p.key}
                  onPress={() => show(p.key, p.label)}
                  accessibilityRole="button"
                  style={{ width: '50%', minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color }} />
                  <AppText variant="caption" color="textSoft" style={{ flex: 1 }} numberOfLines={1}>
                    {p.label}
                  </AppText>
                  <AppText weight="extrabold">{L[p.key].length}</AppText>
                </Pressable>
              ))}
            </View>
          </Panel>
          <Panel title={t('priority')} badge={String(L.open.length)} style={panel}>
            <BarRow label={t('pr_urgent')} value={L.pr_urgent.length} max={prMax} color={colors.red} onPress={() => show('pr_urgent', t('pr_urgent'))} />
            <BarRow label={t('pr_high')} value={L.pr_high.length} max={prMax} color={colors.orange} onPress={() => show('pr_high', t('pr_high'))} />
            <BarRow label={t('pr_medium')} value={L.pr_medium.length} max={prMax} color={colors.amber} onPress={() => show('pr_medium', t('pr_medium'))} />
            <BarRow label={t('pr_low')} value={L.pr_low.length} max={prMax} color={colors.textFaint} onPress={() => show('pr_low', t('pr_low'))} />
          </Panel>
        </View>

        {/* my work */}
        <Card style={{ gap: spacing.md, borderStartWidth: 4, borderStartColor: colors.green }}>
          <View style={{ gap: 2 }}>
            <AppText variant="section">{t('mine')}</AppText>
            <AppText variant="small" color="textMuted">
              {t('mineSub')}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Big tint="red" label={t('my_today')} value={L.my_today.length} onPress={() => show('my_today', t('my_today'))} />
            <Big tint="primary" label={t('my_own')} value={L.my_own.length} onPress={() => show('my_own', t('my_own'))} />
            <Big tint="purple" label={t('my_given')} value={L.my_given.length} onPress={() => show('my_given', t('my_given'))} />
            <Big tint="green" label={t('my_doneWeek')} value={L.my_doneWeek.length} onPress={() => show('my_doneWeek', t('my_doneWeek'))} />
          </View>

          {/* what moved since … */}
          <View style={{ gap: spacing.sm }}>
            <AppText weight="bold">{t('review')}</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {(['today', 'week', '7', '30'] as Since[]).map((s) => (
                <Chip key={s} label={t(s === 'today' ? 'sinceToday' : s === 'week' ? 'sinceWeek' : s === '7' ? 'since7' : 'since30')} selected={since === s} onPress={() => setSince(s)} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {(['rv_new', 'rv_back', 'rv_ready', 'rv_done'] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => show(m, t(m))}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                    minHeight: sizes.touch,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.tile,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.primaryTint : colors.surface,
                  })}
                >
                  <AppText variant="small" color="textSoft">
                    {t(m)}
                  </AppText>
                  <AppText weight="extrabold">{L[m].length}</AppText>
                </Pressable>
              ))}
            </View>
          </View>
        </Card>
      </ScrollView>

      {/* the tasks behind a number */}
      <Modal visible={!!list} transparent animationType="slide" onRequestClose={() => setList(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(11,26,51,0.35)' }} onPress={() => setList(null)} accessibilityLabel={t('close')} />
        <View style={{ maxHeight: '75%', backgroundColor: colors.surface, borderTopLeftRadius: radius.cardLg, borderTopRightRadius: radius.cardLg, padding: spacing.screen, gap: spacing.md }}>
          <AppText variant="section">{`${list?.title ?? ''} · ${list?.items.length ?? 0}`}</AppText>
          <ScrollView style={{ maxHeight: 460 }}>
            {(list?.items ?? []).length === 0 && <AppText color="textMuted">{t('listEmpty')}</AppText>}
            {(list?.items ?? []).map((x, i) => (
              <Pressable
                key={x.id}
                onPress={() => {
                  setList(null);
                  router.push({ pathname: '/14-task-detail', params: { id: x.id } });
                }}
                accessibilityRole="button"
                style={({ pressed }) => ({ paddingVertical: spacing.sm, minHeight: sizes.touch + 8, gap: 4, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 })}
              >
                <AppText weight="bold" numberOfLines={2}>
                  {x.title}
                </AppText>
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                  {[
                    x.owner ? displayName(x.owner, lang) : t('nobody'),
                    x.due_at ? formatDue(x.due_at, lang) : t('noDueShort'),
                    t(`s_${x.status}`, { defaultValue: x.status }),
                  ].join(' · ')}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
          <Button label={t('close')} variant="outline" size="md" onPress={() => setList(null)} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/** a headline number, like Home's glance tiles: tinted when there's something, grey when it's zero; tap = its tasks */
const TINT = {
  primary: { bg: 'primaryTint', fg: colors.primary },
  amber: { bg: 'amberTint', fg: colors.amberText },
  red: { bg: 'redTint', fg: colors.red },
  purple: { bg: 'purpleTint', fg: colors.purple },
  green: { bg: 'greenTint', fg: colors.greenText },
} as const;
function Big({ label, value, sub, tint, onPress }: { label: string; value: number; sub?: string; tint: keyof typeof TINT; onPress: () => void }) {
  const c = TINT[tint];
  return (
    <Pressable
      onPress={onPress}
      disabled={!value}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: 150,
        minHeight: 92,
        padding: spacing.lg,
        gap: 2,
        borderRadius: radius.tile,
        backgroundColor: value ? colors[c.bg] : colors.surfaceMuted,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <AppText variant="titleLg" style={{ color: value ? c.fg : colors.textFaint }}>
        {value}
      </AppText>
      <AppText variant="small" weight="bold" color={value ? 'textSoft' : 'textMuted'} numberOfLines={2}>
        {label}
      </AppText>
      {!!sub && (
        <AppText variant="caption" color="textMuted" numberOfLines={1}>
          {sub}
        </AppText>
      )}
    </Pressable>
  );
}

function Small({ label, value, tone, onPress }: { label: string; value: number; tone?: 'red'; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!value}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: 100,
        minHeight: 66,
        padding: spacing.md,
        gap: 2,
        borderRadius: radius.tile,
        backgroundColor: colors.surfaceMuted,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <AppText weight="extrabold" style={{ fontSize: 20, color: !value ? colors.textFaint : tone === 'red' ? colors.red : colors.text }}>
        {value}
      </AppText>
      <AppText variant="caption" color="textMuted" numberOfLines={2}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Panel({ title, badge, children, style }: { title: string; badge: string; children: React.ReactNode; style?: object }) {
  return (
    <Card style={[{ gap: spacing.sm }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="section" style={{ flex: 1 }} numberOfLines={1}>
          {title}
        </AppText>
        <Chip label={badge} tone="primary" />
      </View>
      <View style={{ gap: spacing.xs }}>{children}</View>
    </Card>
  );
}
