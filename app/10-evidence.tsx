// Screen 10 · Evidence progress — see design/v2/html/Evidence.dc.html (Arabic: EvidenceAR.dc.html)
// Manager screen. Live: active tasks (useTasks) + their subtasks / evidence / owner updates → estimated progress
// vs the self-reported tasks.progress; biggest gaps first. "Offer help" writes activity_log (action 'help_offered').
// Falls back to the design's sample (Khalid · Monthly attendance report) when there is no data.
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Banknote,
  Check,
  ChevronLeft,
  Clock,
  Database,
  Eye,
  FileText,
  Hand,
  History,
  ListChecks,
  MessageCircle,
  Sparkles,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Avatar, Button, Card, Gradient, IconBadge, IconButton, StatTile } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { ACTIVE_STATUSES, useMyProfile, useTasks } from '@/lib/api';
import { formatNumber, taskSavings } from '@/features/home/value';
import { computeSignal, LARGE_GAP, ownerLateness, useTaskSignals, type TaskSignal } from '@/features/evidence/signals';
import { useOfferHelp } from '@/features/evidence/useOfferHelp';
import { NS } from '@/features/evidence/strings';

type Row = {
  key: string;
  Icon: ComponentType<LucideProps>;
  tint: ColorToken;
  fg: ColorToken;
  label: string;
  value: string;
  /** Value shown as a tinted pill (bg token) or plain colored text. */
  pill?: ColorToken;
  valueColor: ColorToken;
};

type VM = {
  id: string;
  sample: boolean;
  title: string;
  owner: string;
  ownerNameEn: string;
  ownerNameAr: string;
  sub: string;
  reported: number;
  signal: number;
  running: string;
  large: boolean;
  rows: Row[];
  insightTitle: string;
  insightBody: string;
  helpMsg: string;
  live: TaskSignal | null;
};

/** Each avoided status check = one follow-up; the design shows 30 min / SAR 100 → 3 follow-ups. */
const SAVINGS = taskSavings(3);

export default function EvidenceScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const me = useMyProfile();
  const allTasks = useTasks();
  const active = useMemo(() => (allTasks.data ?? []).filter((x) => ACTIVE_STATUSES.includes(x.status)), [allTasks.data]);
  const raw = useTaskSignals(active.map((x) => x.id));
  const offer = useOfferHelp();

  const [sample, setSample] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, 'sent' | 'talk'>>({});
  const [failed, setFailed] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const flip = { transform: [{ scaleX: isRTL ? -1 : 1 }] };
  const n = (v: number) => formatNumber(v, lang);
  const locale = lang === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-US';
  const weekday = (iso: string) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(iso));

  const signals = useMemo(() => {
    if (!raw.data) return [];
    return active.map((x) => computeSignal(x, raw.data!)).sort((a, b) => b.gap - a.gap);
  }, [active, raw.data]);
  const gaps = signals.filter((s) => s.gap > 0).slice(0, 5);
  const candidates = gaps.length > 0 ? gaps : signals.slice(0, 1);

  const loading = allTasks.isLoading || (active.length > 0 && raw.isLoading);
  const noData = !loading && candidates.length === 0;
  const useSample = sample || noData;

  const current = candidates.find((c) => c.task.id === selected) ?? candidates[0] ?? null;

  const vm: VM | null = useMemo(() => {
    if (useSample) return demoVM(t);
    if (!current) return null;
    const s = current;
    const task = s.task;
    const ownerEn = task.owner?.full_name.split(' ')[0] ?? '';
    const ownerAr = (task.owner?.full_name_ar ?? task.owner?.full_name ?? '').split(' ')[0] ?? '';
    const owner = lang === 'ar' ? ownerAr : ownerEn;
    const large = s.gap >= LARGE_GAP;
    const runDays = Math.floor((Date.now() - new Date(task.updated_at).getTime()) / 86400000);
    const lastAge = s.lastAt ? ageLabel(s.lastAt, t, lang) : t('none');
    const stale = !s.lastAt || s.idleDays >= 3;
    const late = ownerLateness(task.owner_id, allTasks.data ?? []);
    const day = task.due_at ? weekday(task.due_at) : null;

    const insightBody =
      s.idleDays >= 3
        ? t('stuckIdle', { n: n(s.idleDays) })
        : s.files === 0
          ? t('stuckNoProof', { n: n(s.reported) })
          : t('stuckSteps', { done: n(s.stepsDone), total: n(s.stepsTotal) });

    return {
      id: task.id,
      sample: false,
      title: task.title,
      owner,
      ownerNameEn: ownerEn,
      ownerNameAr: ownerAr,
      sub: day ? t('ownerDue', { name: owner, day }) : t('ownerNoDue', { name: owner }),
      reported: s.reported,
      signal: s.signal,
      running: runDays <= 0 ? t('sinceToday') : runDays === 1 ? t('dayRunning') : t('daysRunning', { n: n(runDays) }),
      large,
      rows: [
        { key: 'last', Icon: FileText, tint: stale ? 'redTint' : 'greenTint', fg: stale ? 'red' : 'green', label: t('lastEvidence'), value: lastAge, pill: stale ? 'redTint' : 'greenTint', valueColor: stale ? 'red' : 'greenText' },
        { key: 'steps', Icon: ListChecks, tint: 'primaryTint', fg: 'primary', label: t('sectionsDone'), value: s.stepsTotal > 0 ? t('ofTotal', { done: n(s.stepsDone), total: n(s.stepsTotal) }) : t('noSteps'), valueColor: 'primary' },
        { key: 'files', Icon: Database, tint: 'amberTint', fg: 'amberText', label: t('files'), value: s.files === 1 ? t('fileOne') : t('filesN', { n: n(s.files) }), pill: 'amberTint', valueColor: 'amberStrong' },
        { key: 'past', Icon: History, tint: 'purpleTint', fg: 'purple', label: t('pastSimilar'), value: late === null ? t('noHistory') : late >= 0.5 ? t('avgLate', { n: n(Math.max(1, Math.round(late))) }) : t('onTime'), valueColor: 'purple' },
      ],
      insightTitle: large ? t('stuckTitle') : t('okTitle'),
      insightBody: large ? insightBody : t('okBody'),
      helpMsg: day ? t('helpMsgLive', { task: task.title, day }) : t('helpMsgLiveNoDue', { task: task.title }),
      live: s,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSample, current, lang, t, allTasks.data]);

  const st = vm ? state[vm.id] : undefined;

  const onHelp = () => {
    if (!vm) return;
    setFailed(false);
    if (vm.sample || !vm.live) {
      setState((s) => ({ ...s, [vm.id]: 'sent' }));
      return;
    }
    if (!me.data) {
      setFailed(true);
      return;
    }
    offer.mutate(
      {
        meId: me.data.id,
        ownerId: vm.live.task.owner_id,
        taskId: vm.live.task.id,
        taskTitle: vm.title,
        ownerName: vm.ownerNameEn,
        ownerNameAr: vm.ownerNameAr,
        reported: vm.reported,
        signal: vm.signal,
      },
      {
        onSuccess: () => setState((s) => ({ ...s, [vm.id]: 'sent' })),
        onError: () => setFailed(true),
      },
    );
  };

  const showActions = !!vm && vm.large;
  const bottomPad = Math.max(insets.bottom, spacing.lg) + spacing.lg;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + spacing.sm }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingBottom: showActions ? 150 + bottomPad : 40, gap: spacing.lg }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <IconButton label={t('back')} onPress={back}>
            <ChevronLeft color={colors.text} size={20} strokeWidth={2} style={flip} />
          </IconButton>
          {vm && (
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="title" numberOfLines={2} style={{ fontSize: 21, lineHeight: 26 }}>
                {vm.title}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Avatar name={vm.owner || '?'} size={18} gradient={vm.sample ? 'avatarGreen' : undefined} />
                <AppText variant="small" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {vm.sub}
                </AppText>
                {vm.sample && (
                  <View style={{ backgroundColor: colors.chip, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 1 }}>
                    <AppText variant="micro" weight="bold" color="textMuted">
                      {t('sample')}
                    </AppText>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        {loading && (
          <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
            <ActivityIndicator color={colors.primary} />
          </Card>
        )}

        {noData && !sample && (
          <AppText variant="caption" color="textMuted" align="center">
            {t('empty')}
          </AppText>
        )}

        {!useSample && candidates.length > 1 && (
          <View style={{ gap: spacing.xs }}>
            <AppText variant="caption" weight="bold" color="textFaint">
              {t('otherGaps')}
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {candidates.map((c) => {
                const on = c.task.id === current?.task.id;
                const name = ((lang === 'ar' ? c.task.owner?.full_name_ar : null) ?? c.task.owner?.full_name ?? '').split(' ')[0] ?? '';
                return (
                  <Pressable
                    key={c.task.id}
                    onPress={() => setSelected(c.task.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${c.task.title} · ${name}`}
                    style={({ pressed }) => ({
                      minHeight: sizes.touch,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingStart: 4,
                      paddingEnd: spacing.lg,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: on ? colors.primary : colors.borderBlue,
                      backgroundColor: on ? colors.primaryTint : colors.surface,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Avatar name={name || '?'} size={30} />
                    <AppText variant="small" weight="bold" color={on ? 'primary' : 'text'}>
                      {t('gapChip', { name, n: n(Math.max(0, c.gap)) })}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {vm && (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Card padding={0} style={{ flex: 1, paddingVertical: spacing.xl, paddingHorizontal: spacing.xxl, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MessageCircle color={colors.textFaint} size={14} strokeWidth={2} />
                  <AppText variant="small" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {t('says', { name: vm.owner })}
                  </AppText>
                </View>
                <AppText weight="extrabold" color="textMuted" style={{ fontSize: 38, lineHeight: 44 }}>
                  {t('pct', { n: n(vm.reported) })}
                </AppText>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden', flexDirection: 'row' }}>
                  <View style={{ width: `${vm.reported}%`, backgroundColor: colors.textFaint, borderRadius: 3 }} />
                </View>
                <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
                  {vm.running}
                </AppText>
              </Card>
              <SeesCard large={vm.large}>
                <View style={{ position: 'absolute', end: -30, top: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: colors.glass }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Eye color={colors.onDark} size={14} strokeWidth={2} />
                  <AppText variant="small" color="onDarkMuted">
                    {t('sees')}
                  </AppText>
                </View>
                <AppText weight="extrabold" color="onDark" style={{ fontSize: 38, lineHeight: 44 }}>
                  {t('approx', { n: n(vm.signal) })}
                </AppText>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.glassBorder, overflow: 'hidden', flexDirection: 'row' }}>
                  <View style={{ width: `${vm.signal}%`, backgroundColor: colors.onDark, borderRadius: 3 }} />
                </View>
                <AppText variant="caption" color="onDarkMuted" style={{ marginTop: 2 }}>
                  {t('fromEvidence')}
                </AppText>
              </SeesCard>
            </View>

            <Card padding={0} style={{ paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl, gap: spacing.sm }}>
              <AppText variant="lead" display>
                {t('evidence')}
              </AppText>
              {vm.rows.map((r, i) => (
                <View key={r.key} style={{ gap: spacing.sm }}>
                  {i > 0 && <View style={{ height: 1, backgroundColor: colors.border, marginStart: 48 }} />}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
                    <IconBadge size={36} bg={r.tint}>
                      <r.Icon color={colors[r.fg]} size={18} strokeWidth={1.8} />
                    </IconBadge>
                    <AppText style={{ flex: 1 }} numberOfLines={1}>
                      {r.label}
                    </AppText>
                    {r.pill ? (
                      <View style={{ backgroundColor: colors[r.pill], borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 }}>
                        <AppText variant="small" weight="bold" color={r.valueColor}>
                          {r.value}
                        </AppText>
                      </View>
                    ) : (
                      <AppText variant="small" weight="bold" color={r.valueColor}>
                        {r.value}
                      </AppText>
                    )}
                  </View>
                </View>
              ))}
            </Card>

            <Card padding={0} style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', start: 0, top: 0, bottom: 0, width: 4, backgroundColor: vm.large ? colors.primary : colors.green }} />
              <IconBadge size={36} gradient={vm.large ? 'avatarBlue' : 'success'}>
                {vm.large ? <Sparkles color={colors.onDark} size={18} strokeWidth={1.8} /> : <Check color={colors.onDark} size={18} strokeWidth={2.2} />}
              </IconBadge>
              <View style={{ flex: 1, gap: 1 }}>
                <AppText weight="bold">{vm.insightTitle}</AppText>
                <AppText variant="caption" color="textMuted">
                  {vm.insightBody}
                </AppText>
              </View>
            </Card>

            {!vm.large && !vm.sample && (
              <Pressable onPress={() => setSample(true)} accessibilityRole="button" style={{ minHeight: sizes.touch, alignItems: 'center', justifyContent: 'center' }}>
                <AppText variant="small" weight="bold" color="primary">
                  {t('showSample')}
                </AppText>
              </Pressable>
            )}

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <StatTile iconBg="primaryTint" icon={<Clock color={colors.primary} size={15} strokeWidth={2.2} />}
                value={t('minutes', { n: n(SAVINGS.minutes) })} label={t('timeSaved')} />
              <StatTile iconBg="greenTint" icon={<Banknote color={colors.green} size={15} strokeWidth={2.2} />}
                value={n(SAVINGS.sar)} label={t('sarSaved')} />
              <StatTile iconBg="orangeTint" icon={<Hand color={colors.orange} size={15} strokeWidth={2.2} />}
                value={n(0)} label={t('meetings')} />
            </View>
          </>
        )}
      </ScrollView>

      {vm && showActions && (
        <View style={{ position: 'absolute', start: spacing.screen, end: spacing.screen, bottom: bottomPad, gap: spacing.md }}>
          {failed && (
            <AppText variant="small" color="red" align="center">
              {t('failed')}
            </AppText>
          )}
          {st === 'sent' ? (
            <Card elevation="raised" padding={0} style={{ paddingVertical: spacing.xl, paddingHorizontal: spacing.xxl, gap: 6, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', start: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.green }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' }}>
                  <Check color={colors.green} size={12} strokeWidth={3} />
                </View>
                <AppText variant="caption" weight="bold" color="green">
                  {t('sentTo', { name: vm.owner })}
                </AppText>
              </View>
              <AppText color="textSoft" style={{ lineHeight: 21 }}>
                {vm.helpMsg}
                <AppText weight="bold" color="orangeText">
                  {t('helpPts')}
                </AppText>
                {t('helpClose')}
              </AppText>
            </Card>
          ) : st === 'talk' ? (
            <Card elevation="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Check color={colors.primary} size={18} strokeWidth={2.2} />
              <AppText style={{ flex: 1 }}>{t('talkNote')}</AppText>
            </Card>
          ) : (
            <>
              <Button
                label={t('offerHelp')}
                icon={<Sparkles color={colors.onDark} size={20} strokeWidth={2} />}
                onPress={onHelp}
                loading={offer.isPending}
              />
              <Button
                variant="outline"
                size="md"
                label={t('talkMyself', { name: vm.owner })}
                onPress={() => setState((s) => ({ ...s, [vm.id]: 'talk' }))}
                style={{ minHeight: 48 }}
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}

function SeesCard({ large, children }: { large: boolean; children: ReactNode }) {
  const style = { flex: 1, borderRadius: radius.card, paddingVertical: spacing.xl, paddingHorizontal: spacing.xxl, gap: 4, overflow: 'hidden' } as const;
  if (large) {
    return <View style={[style, { backgroundColor: colors.red, boxShadow: shadows.raised }]}>{children}</View>;
  }
  return (
    <Gradient name="success" style={[style, { boxShadow: shadows.raised }]}>
      {children}
    </Gradient>
  );
}

type T = (key: string, opts?: Record<string, unknown>) => string;

function ageLabel(iso: string, t: T, lang: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return t('agoNow');
  const h = Math.round(mins / 60);
  if (h < 24) return t('agoH', { n: formatNumber(h, lang) });
  return t('agoD', { n: formatNumber(Math.round(h / 24), lang) });
}

/** design/v2/html/Evidence.dc.html */
function demoVM(t: T): VM {
  return {
    id: 'demo',
    sample: true,
    title: t('demo.task'),
    owner: t('demo.owner'),
    ownerNameEn: 'Khalid',
    ownerNameAr: 'خالد',
    sub: t('ownerDue', { name: t('demo.owner'), day: t('demo.due') }),
    reported: 90,
    signal: 40,
    running: t('daysRunning', { n: 6 }),
    large: true,
    rows: [
      { key: 'last', Icon: FileText, tint: 'redTint', fg: 'red', label: t('lastEvidence'), value: t('demo.lastEdit'), pill: 'redTint', valueColor: 'red' },
      { key: 'steps', Icon: ListChecks, tint: 'primaryTint', fg: 'primary', label: t('sectionsDone'), value: t('demo.sections'), valueColor: 'primary' },
      { key: 'data', Icon: Database, tint: 'amberTint', fg: 'amberText', label: t('demo.dataLabel'), value: t('demo.dataValue'), pill: 'amberTint', valueColor: 'amberStrong' },
      { key: 'past', Icon: History, tint: 'purpleTint', fg: 'purple', label: t('pastSimilar'), value: t('demo.past'), valueColor: 'purple' },
    ],
    insightTitle: t('stuckTitle'),
    insightBody: t('demo.stuckBody'),
    helpMsg: t('helpMsgDemo'),
    live: null,
  };
}
