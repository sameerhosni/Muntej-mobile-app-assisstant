// Screen 24 · Roadmap — see design/v2/html/ProjectRoadmap.dc.html (Arabic: ProjectRoadmapAR.dc.html)
// Live data: tasks with start_at / due_at / expected_close_at / progress / status, grouped by workspace (= project).
// Forecast is computed locally (src/features/roadmap/model.ts). Nobody drags bars — the plan is built from tasks.
// Apply = live update of the task's due_at (late → match the forecast) or expected_close_at (behind → real finish),
// logged to activity_log as 'roadmap_adjusted' (undoable, previous dates in undo_payload); "move it" opens Load Radar.
// No dated tasks yet → the design's six sample projects (incl. "Qiwa integration"); Apply there is local state only.
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarDays, Check, ChevronLeft, Flag, PieChart, Sparkles, TrendingUp, UserRoundCog } from 'lucide-react-native';
import { AppText, Button, Card, Gradient, Hero, IconBadge, IconButton } from '@/components/ui';
import { colors, gradients, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTasks } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { DAY_MS, startOfDay } from '@/features/dashboard/metrics';
import { Stripes } from '@/features/roadmap/Stripes';
import { fmtDate, frac, liveProjects, sampleProjects, windowStart, type Forecast, type RoadRow } from '@/features/roadmap/model';
import { useRoadmapApply, useRoadmapUndo, type Applied } from '@/features/roadmap/useRoadmapApply';
import { NS } from '@/features/roadmap/strings';

type Level = 'p' | 't';

const TONE: Record<Forecast, { bar: ColorToken; text: ColorToken; tint: ColorToken }> = {
  on_track: { bar: 'primary', text: 'primaryDark', tint: 'primaryTint' },
  at_risk: { bar: 'amberText', text: 'amberStrong', tint: 'amberTint' },
  delay: { bar: 'red', text: 'red', tint: 'redTint' },
};

const LABEL_W = 92;
const ROW_H = 52;

export default function RoadmapScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const tasks = useTasks();
  const me = useMyProfile();
  const apply = useRoadmapApply();
  const undo = useRoadmapUndo();

  const [level, setLevel] = useState<Level>('p');
  const [selProject, setSelProject] = useState<string | null>(null);
  const [selTask, setSelTask] = useState<string | null>(null);
  const [fixed, setFixed] = useState<Record<string, boolean>>({});
  const [applied, setApplied] = useState<{ rowId: string; result?: Applied } | null>(null);
  const [undone, setUndone] = useState<string | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const live = useMemo(() => liveProjects(tasks.data ?? [], lang, t('noWorkspace')), [tasks.data, lang, t]);
  const sample = !tasks.isLoading && live.length === 0;
  const projects = useMemo(
    () =>
      sample
        ? sampleProjects(
            {
              spl: t('demo.spl'), nt: t('demo.nt'), beta: t('demo.beta'), qiwa: t('demo.qiwa'), woj: t('demo.woj'), wal: t('demo.wal'),
              tipNt: t('demo.tipNt'), tipQiwa: t('demo.tipQiwa'), tipWal: t('demo.tipWal'), gainDay: t('demo.gainDay'),
              gainQiwa: t('demo.gainQiwa'), qiwaTasks: t('demo.qiwaTasks'), tasks: t('demo.tasks'),
            },
            fixed,
          )
        : live,
    [sample, live, fixed, t],
  );

  const fallback = projects.find((p) => p.forecast === 'delay') ?? projects.find((p) => p.forecast === 'at_risk') ?? projects[0];
  const project = projects.find((p) => p.id === selProject) ?? fallback;
  const rows = level === 'p' ? projects : project?.children ?? [];
  const selected: RoadRow | undefined =
    level === 'p'
      ? project
      : rows.find((r) => r.id === selTask) ?? rows.find((r) => r.forecast === 'delay') ?? rows.find((r) => r.forecast === 'at_risk') ?? rows[0];

  // ── dates ──
  const w0 = windowStart();
  const todayFrac = frac(Date.now(), w0);
  const date = (ms: number) => fmtDate(ms, t('months'), (m, d) => t('dateFmt', { m, d: formatNumber(d, lang) }));
  // Axis ticks are placed at their own fraction of the window (same scale as the bars), from the start edge.
  const ticks = [0, 1, 2, 3, 4].map((k) => {
    const ms = startOfDay().getTime() + k * 14 * DAY_MS;
    return { label: date(ms), f: frac(ms, w0) };
  }).filter((tk) => tk.f <= 0.85); // a tick near the end edge would collide with its neighbour
  const statusOf = (r: RoadRow) =>
    r.forecast === 'on_track'
      ? t('onTrack')
      : r.forecast === 'at_risk'
        ? t('atRisk')
        : r.lateDays === 1
          ? t('dayLate')
          : t('daysLate', { n: formatNumber(r.lateDays, lang) });

  // ── apply / undo ──
  const s = selected?.suggestion ?? null;
  const isApplied = !!selected && applied?.rowId === selected.id;
  const onApply = () => {
    if (!selected || !s) return;
    setUndone(null);
    if (s.kind === 'demo') {
      setFixed((f) => ({ ...f, [selected.id]: true }));
      setApplied({ rowId: selected.id });
      return;
    }
    if (!me.data) return;
    const statusEn = selected.forecast === 'delay' ? `${selected.lateDays} days late` : 'at risk';
    const rowId = selected.id;
    apply.mutate({ s, meId: me.data.id, statusEn }, { onSuccess: (result) => setApplied({ rowId, result }) });
  };
  const onUndo = () => {
    if (!applied?.result) return;
    const rowId = applied.rowId;
    undo.mutate(applied.result, { onSuccess: () => { setApplied(null); setUndone(rowId); } });
  };
  const openLoadRadar = () => {
    if (!s || s.kind === 'demo') return;
    router.push({ pathname: '/11-load-radar', params: { task: s.taskId, title: s.task, ...(s.hours ? { hours: String(s.hours) } : {}) } });
  };

  const tipText = !s
    ? ''
    : s.kind === 'demo'
      ? s.tip
      : s.kind === 'move_due'
        ? t('tip.moveDue', { task: s.task, date: date(s.date), n: formatNumber(s.days, lang) })
        : t('tip.setForecast', { task: s.task, date: date(s.date), n: formatNumber(s.behind, lang) });
  const gainText = !s ? '' : s.kind === 'demo' ? s.gain : s.kind === 'move_due' ? t('gain.moveDue') : t('gain.setForecast');

  const tone = selected ? TONE[selected.forecast] : TONE.on_track;
  const scopeLabel =
    level === 'p' ? t('scopeProjects', { n: formatNumber(projects.length, lang) }) : t('scopeTasks', { name: project?.name ?? '' });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={tasks.isRefetching} onRefresh={() => tasks.refetch()} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <Hero overlap={26}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconButton variant="glass" label={t('back')} onPress={back}>
              <ChevronLeft color={colors.onDark} size={22} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </IconButton>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AppText variant="titleLg" color="onDark" numberOfLines={1} style={{ lineHeight: 32 }}>
                {t('title')}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Sparkles color={colors.onDark} fill={colors.onDark} size={13} strokeWidth={1.5} />
                <AppText variant="small" color="onDarkMuted" numberOfLines={1}>
                  {t('subtitle')}
                </AppText>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <View accessibilityRole="tablist" style={{ flex: 1, flexDirection: 'row', gap: 4, padding: 3, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill }}>
              {(['p', 't'] as Level[]).map((l) => {
                const on = level === l;
                return (
                  <Pressable
                    key={l}
                    onPress={() => setLevel(l)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    style={{ flex: 1, minHeight: sizes.touch - 6, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.surface : colors.transparent }}
                  >
                    <AppText weight="bold" color={on ? 'primary' : 'onDark'}>
                      {t(l === 'p' ? 'projects' : 'tasks')}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ height: sizes.touch + 2, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder }}>
              <CalendarDays color={colors.onDark} size={14} strokeWidth={2} />
              <AppText variant="caption" weight="bold" color="onDark">
                {t('weeks')}
              </AppText>
            </View>
          </View>
        </Hero>

        <View style={{ paddingHorizontal: 16, marginTop: -26, gap: spacing.lg }}>
          {/* timeline */}
          <Card elevation="raised" padding={0} style={{ paddingTop: spacing.lg, paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 4 }}>
              <AppText variant="caption" weight="semibold" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                {scopeLabel}
              </AppText>
              {sample && (
                <View style={{ backgroundColor: colors.chip, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                  <AppText variant="micro" weight="bold" color="textMuted">
                    {t('sample')}
                  </AppText>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ width: LABEL_W }} />
              <View style={{ flex: 1, height: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                {ticks.map((tk, i) => (
                  <AtStart key={i} at={tk.f} anchor={tk.f >= 0.9 ? 'end' : 'start'} style={{ top: 0 }}>
                    <AppText variant="micro" color="textFaint" numberOfLines={1}>
                      {tk.label}
                    </AppText>
                  </AtStart>
                ))}
              </View>
            </View>

            {tasks.isLoading && <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xxl }} />}
            {!tasks.isLoading &&
              rows.map((r) => (
                <TimelineRow
                  key={r.id}
                  row={r}
                  w0={w0}
                  todayFrac={todayFrac}
                  isRTL={isRTL}
                  selected={r.id === selected?.id}
                  startLabel={date(r.start)}
                  endLabel={date(r.expected)}
                  a11y={t('rowA11y', { name: r.name, status: statusOf(r), start: date(r.start), end: date(r.expected) })}
                  onPress={() => {
                    if (level === 'p') setSelProject(r.id);
                    else setSelTask(r.id);
                  }}
                />
              ))}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, justifyContent: 'center', paddingTop: spacing.sm }}>
              <Legend swatch={<Gradient name="avatarBlue" direction="horizontal" style={{ width: 12, height: 8, borderRadius: 4 }} />} label={t('onTrack')} />
              <Legend swatch={<View style={{ width: 12, height: 8, borderRadius: 4, backgroundColor: colors.amberText }} />} label={t('atRisk')} />
              <Legend swatch={<Stripes a="red" b="redTint" stripe={3} style={{ width: 12, height: 8, borderRadius: 4 }} />} label={t('likelyDelay')} />
              <Legend swatch={<View style={{ width: 2, height: 10, backgroundColor: colors.purple }} />} label={t('today')} />
            </View>
          </Card>

          {/* selected bar */}
          {selected && (
            <Card padding={0} style={{ paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, gap: spacing.sm, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', start: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors[tone.bar] }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
                <AppText variant="stat" display weight="semibold" numberOfLines={2} style={{ flex: 1 }}>
                  {selected.name}
                </AppText>
                <View style={{ backgroundColor: colors[tone.tint], borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 }}>
                  <AppText variant="caption" weight="bold" color={tone.text}>
                    {statusOf(selected)}
                  </AppText>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Fact bg="primaryTint" icon={<CalendarDays color={colors.primary} size={12} strokeWidth={2.2} />} label={t('start')} value={date(selected.start)} />
                <Fact bg="purpleTint" icon={<Flag color={colors.purple} size={12} strokeWidth={2.2} />} label={t('due')} value={date(selected.due)} />
                <Fact
                  bg="redTint"
                  icon={<TrendingUp color={colors.red} size={12} strokeWidth={2.2} />}
                  label={t('finish')}
                  value={`${date(selected.expected)}${selected.forecast === 'at_risk' ? ' ?' : ''}`}
                  color={tone.text}
                />
                <Fact bg="greenTint" icon={<PieChart color={colors.green} size={12} strokeWidth={2.2} />} label={t('done')} value={t('pct', { n: formatNumber(selected.progress, lang) })} color="primary" />
              </View>

              {isApplied ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.greenTint, borderRadius: radius.md, paddingVertical: 4, paddingStart: spacing.md, paddingEnd: 4, minHeight: sizes.touch + 8 }}>
                  <Check color={colors.green} size={18} strokeWidth={2.4} />
                  <AppText variant="small" weight="bold" color="greenText" style={{ flex: 1 }}>
                    {applied?.result ? t('applied') : t('appliedSample')}
                  </AppText>
                  {applied?.result && <Button size="md" variant="ghost" label={t('undo')} onPress={onUndo} loading={undo.isPending} />}
                </View>
              ) : undone === selected.id ? (
                <AppText variant="small" weight="semibold" color="textMuted">
                  {t('undone')}
                </AppText>
              ) : s ? (
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: colors.purpleTint, borderRadius: radius.md, paddingVertical: spacing.sm, paddingStart: spacing.md, paddingEnd: spacing.sm }}>
                    <IconBadge size={28} gradient="purple">
                      <Sparkles color={colors.onDark} fill={colors.onDark} size={14} strokeWidth={1.5} />
                    </IconBadge>
                    <View style={{ flex: 1, gap: 4 }}>
                      <AppText variant="caption" weight="semibold" color="textSoft" style={{ lineHeight: 17 }}>
                        {tipText}
                      </AppText>
                      <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingVertical: 2, paddingStart: 4, paddingEnd: spacing.sm }}>
                        <Check color={colors.green} size={12} strokeWidth={2.4} />
                        <AppText variant="micro" weight="bold" color="greenText">
                          {gainText}
                        </AppText>
                      </View>
                    </View>
                    <Button size="md" label={t('apply')} onPress={onApply} loading={apply.isPending} />
                  </View>
                  {s.kind !== 'demo' && (
                    <Pressable
                      onPress={openLoadRadar}
                      accessibilityRole="link"
                      style={({ pressed }) => ({ minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', opacity: pressed ? 0.7 : 1 })}
                    >
                      <UserRoundCog color={colors.primary} size={16} strokeWidth={2} />
                      <AppText variant="small" weight="bold" color="primary">
                        {t('reassign')}
                      </AppText>
                    </Pressable>
                  )}
                </View>
              ) : null}
              {(apply.isError || undo.isError) && (
                <AppText variant="small" color="red">
                  {t('error')}
                </AppText>
              )}
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

type RowProps = {
  row: RoadRow;
  w0: number;
  todayFrac: number;
  isRTL: boolean;
  selected: boolean;
  startLabel: string;
  endLabel: string;
  a11y: string;
  onPress: () => void;
};

function TimelineRow({ row, w0, todayFrac, isRTL, selected, startLabel, endLabel, a11y, onPress }: RowProps) {
  const s = frac(row.start, w0);
  const e = Math.max(s + 0.01, frac(row.due, w0));
  const x = frac(row.expected, w0);
  const endPos = Math.max(e, x);
  const delayW = row.forecast === 'delay' ? Math.max(0, x - e) : 0;
  const tone = TONE[row.forecast];
  const endColor: ColorToken = row.forecast === 'delay' ? 'red' : row.forecast === 'at_risk' ? 'amberStrong' : 'primaryDark';
  const pct = (v: number): `${number}%` => `${Math.round(v * 1000) / 10}%`;
  const fill = Math.max(0, Math.min(100, row.progress));
  const fillRadius = { borderRadius: 8 };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={a11y}
      style={({ pressed }) => ({ height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.sm, backgroundColor: selected ? colors.primaryTint : colors.transparent, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ width: LABEL_W, flexDirection: 'row', alignItems: 'center', gap: 5, paddingStart: 4, overflow: 'hidden' }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: row.dot }} />
        <AppText variant="caption" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
          {row.name}
        </AppText>
      </View>
      <View style={{ flex: 1, height: ROW_H }}>
        {/* All marks are laid out from the start edge with flex rows (right in Arabic, left in English),
            so they follow the same direction as the date axis. */}
        {/* today line */}
        <AtStart at={todayFrac} style={{ top: 0, bottom: 0 }}>
          <View style={{ width: 2, height: '100%', borderRadius: 1, backgroundColor: colors.purple, opacity: 0.7 }} />
        </AtStart>
        {/* start date (above the bar) */}
        <AtStart at={Math.min(s, 0.7)} style={{ top: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 2, height: 9, borderRadius: 1, backgroundColor: colors.textFaint }} />
            <AppText variant="micro" weight="semibold" color="textMuted" numberOfLines={1}>
              {startLabel}
            </AppText>
          </View>
        </AtStart>
        {/* planned bar with progress */}
        <AtStart at={s} style={{ top: 18, height: 16 }}>
          <View style={{ width: pct(e - s), height: 16, borderRadius: 8, backgroundColor: colors.track, overflow: 'hidden', flexDirection: 'row' }}>
            {row.forecast === 'on_track' ? (
              <LinearGradient
                colors={gradients.avatarBlue}
                start={{ x: isRTL ? 1 : 0, y: 0 }}
                end={{ x: isRTL ? 0 : 1, y: 0 }}
                style={[{ width: `${fill}%` }, fillRadius]}
              />
            ) : (
              <View style={[{ width: `${fill}%`, backgroundColor: colors[tone.bar] }, fillRadius]} />
            )}
          </View>
        </AtStart>
        {/* likely delay (stripes) */}
        {delayW > 0 && (
          <AtStart at={e} style={{ top: 18, height: 16 }}>
            <Stripes a="red" b="redTint" style={{ width: pct(delayW), height: 16, borderTopEndRadius: 8, borderBottomEndRadius: 8 }} />
          </AtStart>
        )}
        {/* expected close (below the bar), ends at the bar's end */}
        <AtStart at={Math.max(endPos, 0.3)} anchor="end" style={{ bottom: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <AppText variant="micro" weight="bold" color={endColor} numberOfLines={1}>
              {endLabel}
            </AppText>
            <View style={{ width: 2, height: 9, borderRadius: 1, backgroundColor: colors[endColor] }} />
          </View>
        </AtStart>
      </View>
    </Pressable>
  );
}

/**
 * Absolute full-width layer that places its child at fraction `at` of the track, measured from the start edge.
 * Uses a flex row + percentage spacer instead of `start`/`left` insets, so it follows the layout direction exactly
 * like the axis does (start-anchored: child begins at `at`; end-anchored: child ends at `at`).
 */
function AtStart({ at, anchor = 'start', style, children }: { at: number; anchor?: 'start' | 'end'; style?: ViewStyle; children: ReactNode }) {
  const w: `${number}%` = `${Math.round(Math.max(0, Math.min(1, at)) * 1000) / 10}%`;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, flexDirection: 'row' }, style]}>
      {anchor === 'start' ? (
        <>
          <View style={{ width: w }} />
          {children}
        </>
      ) : (
        <View style={{ width: w, flexDirection: 'row', justifyContent: 'flex-end' }}>{children}</View>
      )}
    </View>
  );
}

function Legend({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {swatch}
      <AppText variant="micro" color="textSoft">
        {label}
      </AppText>
    </View>
  );
}

function Fact({ bg, icon, label, value, color = 'text' }: { bg: ColorToken; icon: ReactNode; label: string; value: string; color?: ColorToken }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <IconBadge size={22} bg={bg}>
          {icon}
        </IconBadge>
        <AppText variant="micro" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </AppText>
      </View>
      <AppText variant="small" weight="bold" color={color} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}
