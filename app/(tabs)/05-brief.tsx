// Screen 05 · Weekly brief — see design/v2/html/Brief.dc.html (Arabic: BriefAR.dc.html)
// Live data: tasks (closed / on-time / team pulse / kudos suggestion), useHomeStats (hours saved, follow-ups),
// activity_log (month value), pending decisions. Falls back to the design's demo week when there are no tasks.
// The audio brief is read aloud by the speak Edge Function (useSpokenBrief). Accepting the kudos suggestion is local state.
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Banknote, CalendarDays, ChevronRight, CircleCheck, Clock, Hand, Pause, Play, Send, Sparkles, TrendingUp } from 'lucide-react-native';
import { AppText, Avatar, avatarGradientFor, Card, Gradient, Hero, IconBadge, PointsCoin, StatTile } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing, type ColorToken, type GradientToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useActivity, useHomeStats, usePendingDecisionCount, useTasks, useTeam } from '@/lib/api';
import { formatNumber, hoursSaved, MIN_PER_FOLLOWUP, MIN_PER_UPDATE, sarSaved } from '@/features/home/value';
import { person } from '@/features/demo/team';
import { DAY_MS, firstName, onTimeRate, personName, startOfWeek, touchedIn } from '@/features/dashboard/metrics';
import { BRIEF_DEMO } from '@/features/brief/demo';
import { clock } from '@/features/brief/useDemoAudio';
import { useSpokenBrief } from '@/features/brief/useSpokenBrief';
import { NS } from '@/features/brief/strings';

const AUDIO_SEC = 60;
const WAVE = [8, 14, 18, 10, 16, 12, 18, 8, 14, 10, 16, 6];
const WAVE_ON: ColorToken[] = ['primary', 'primary', 'primaryLight', 'cyan'];
/** Design shows the player paused part-way (0:18 / 1:00); keep that look until playback starts. */
const WAVE_IDLE_ON = 4;

/** Team pulse colour per level (design): ≥85% blue, 70–84% purple, <70% orange. */
function pulseLevel(rate: number): { gradient: GradientToken; fg: ColorToken } {
  if (rate >= 85) return { gradient: 'avatarBlue', fg: 'primary' };
  if (rate >= 70) return { gradient: 'avatarPurple', fg: 'purple' };
  return { gradient: 'warning', fg: 'amberText' };
}

type PulseRow = { id: string; name: string; rate: number; gradient: GradientToken };
type Suggestion = { id: string; name: string; kind: 'up' | 'top'; n: number; gradient: GradientToken };

export default function BriefScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const tasks = useTasks();
  const team = useTeam();
  const stats = useHomeStats();
  const activity = useActivity(500);
  const calls = usePendingDecisionCount();
  const [accepted, setAccepted] = useState(false);

  const taskList = tasks.data ?? [];
  const live = taskList.length > 0;

  const week = useMemo(() => {
    const from = startOfWeek().getTime();
    const end = from + 5 * DAY_MS - 1; // Sun–Thu
    return { from, end };
  }, []);

  const rangeLabel = useMemo(() => {
    const loc = lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-US';
    const a = new Date(week.from);
    const b = new Date(week.end);
    const month = new Intl.DateTimeFormat(loc, { month: lang === 'ar' ? 'long' : 'short' }).format(a);
    return t('range', { month, a: a.getDate(), b: b.getDate() });
  }, [week, lang, t]);

  const computed = useMemo(() => {
    const now = Date.now();
    const weekTasks = taskList.filter((x) => touchedIn(x, week.from, now + 1));
    const closed = weekTasks.filter((x) => x.status === 'done').length;
    const weekRate = onTimeRate(weekTasks, now).rate;

    // Team pulse: last 30 days per employee.
    const since30 = now - 30 * DAY_MS;
    const employees = (team.data ?? []).filter((p) => p.role === 'employee');
    const pulse: PulseRow[] = employees
      .map((p) => {
        const name = firstName(personName(p, lang));
        const r = onTimeRate(taskList.filter((x) => x.owner_id === p.id && touchedIn(x, since30, now + 1)), now);
        return { id: p.id, name, rate: r.rate, gradient: avatarGradientFor(name) };
      })
      .filter((r): r is PulseRow => r.rate !== null)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 4);

    // Predictive suggestion: biggest on-time gain (last 14 days vs the 4 weeks before), else the top performer.
    let suggestion: Suggestion | null = null;
    const recentFrom = now - 14 * DAY_MS;
    const priorFrom = now - 42 * DAY_MS;
    let best = 0;
    for (const p of employees) {
      const mine = taskList.filter((x) => x.owner_id === p.id);
      const rec = onTimeRate(mine.filter((x) => touchedIn(x, recentFrom, now + 1)), now).rate;
      const pri = onTimeRate(mine.filter((x) => touchedIn(x, priorFrom, recentFrom)), now).rate;
      if (rec !== null && pri !== null && rec - pri >= 5 && rec - pri > best) {
        best = rec - pri;
        const name = firstName(personName(p, lang));
        suggestion = { id: p.id, name, kind: 'up', n: rec - pri, gradient: avatarGradientFor(name) };
      }
    }
    if (!suggestion && pulse[0]) {
      suggestion = { id: pulse[0].id, name: pulse[0].name, kind: 'top', n: pulse[0].rate, gradient: pulse[0].gradient };
    }

    // Month value from activity_log (same estimate as Autopilot).
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    let monthMin = 0;
    for (const a of activity.data ?? []) {
      if (new Date(a.created_at).getTime() < monthStart) continue;
      if (a.action === 'followup_sent') monthMin += MIN_PER_FOLLOWUP;
      else if (a.action === 'update_received' || a.action === 'submission_received') monthMin += MIN_PER_UPDATE;
    }
    return { closed, weekRate, pulse, suggestion, monthH: monthMin / 60 };
  }, [taskList, team.data, activity.data, week, lang]);

  const hs = stats.data;
  const liveHours = hs ? hoursSaved(hs.followupsSent, hs.updatesReceived) : 0;

  const demoSuggestion = (): Suggestion => {
    const p = person(BRIEF_DEMO.suggestion.id);
    return { id: p.id, name: lang === 'ar' ? p.nameAr : p.name, kind: BRIEF_DEMO.suggestion.kind, n: BRIEF_DEMO.suggestion.n, gradient: p.gradient };
  };

  const v = live
    ? {
        hours: liveHours,
        sar: sarSaved(liveHours),
        closed: computed.closed,
        onTime: computed.weekRate,
        followups: hs?.followupsSent ?? 0,
        calls,
        monthH: computed.monthH,
        monthSar: sarSaved(computed.monthH),
        pulse: computed.pulse,
        // Live mode never mixes in sample numbers: no judged tasks yet → no suggestion card.
        suggestion: computed.suggestion,
      }
    : {
        hours: BRIEF_DEMO.hours,
        sar: BRIEF_DEMO.sar,
        closed: BRIEF_DEMO.closed,
        onTime: BRIEF_DEMO.onTime as number | null,
        followups: BRIEF_DEMO.followups,
        calls: BRIEF_DEMO.calls,
        monthH: BRIEF_DEMO.monthHours,
        monthSar: BRIEF_DEMO.monthSar,
        pulse: BRIEF_DEMO.pulse.map((r) => {
          const p = person(r.id);
          return { id: r.id, name: lang === 'ar' ? p.nameAr : p.name, rate: r.rate, gradient: p.gradient };
        }),
        suggestion: demoSuggestion(),
      };

  const pctText = (n: number | null) => (n === null ? t('none') : t('pct', { n: formatNumber(n, lang) }));
  const audioScript = t('audioScript', {
    closed: formatNumber(v.closed, lang),
    onTime: pctText(v.onTime),
    followups: formatNumber(v.followups, lang),
    calls: formatNumber(v.calls, lang),
  });
  // read aloud for real (Saudi Arabic or English), made on the first tap
  const audio = useSpokenBrief(audioScript, lang);
  const waveOn = audio.playing || audio.pos > 0 ? Math.round(audio.progress * WAVE.length) : WAVE_IDLE_ON;
  const refreshing = tasks.isRefetching || stats.isRefetching;
  const onRefresh = () => {
    tasks.refetch();
    stats.refetch();
    activity.refetch();
    team.refetch();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <Hero overlap={24}>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
              <AppText variant="titleLg" color="onDark" style={{ fontSize: 28, lineHeight: 36, flexShrink: 1 }}>
                {t('title')}
              </AppText>
              <GlassPill icon={<CalendarDays color={colors.onDark} size={13} strokeWidth={2.2} />} label={rangeLabel} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppText color="onDarkMuted">{t('savedYou')}</AppText>
              {!live && !tasks.isLoading && (
                <View style={{ backgroundColor: colors.glass, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                  <AppText variant="micro" weight="bold" color="onDark">
                    {t('sample')}
                  </AppText>
                </View>
              )}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile variant="glass" iconBg="primaryLight" icon={<Clock color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={formatNumber(v.hours, lang, 1)} label={t('timeSaved')} />
            <StatTile variant="glass" iconBg="green" icon={<Banknote color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={formatNumber(v.sar, lang)} label={t('sarSaved')} />
            <StatTile variant="glass" iconBg="orange" icon={<Hand color={colors.onDark} size={14} strokeWidth={2.2} />}
              value={formatNumber(0, lang)} label={t('chases')} />
          </View>
        </Hero>

        <View style={{ paddingHorizontal: spacing.screen, marginTop: -24, gap: spacing.lg }}>
          {/* 1-minute audio brief, read aloud by Muntej */}
          <Card elevation="raised" padding={spacing.lg} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl }}>
            <Pressable
              onPress={audio.toggle}
              accessibilityRole="button"
              accessibilityLabel={audio.playing ? t('pause') : t('play')}
              accessibilityHint={audioScript}
              style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, boxShadow: shadows.primary, opacity: pressed ? 0.85 : 1 })}
            >
              <Gradient name="primary" style={{ flex: 1, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}>
                {audio.loading ? (
                  <ActivityIndicator color={colors.onDark} />
                ) : audio.playing ? (
                  <Pause color={colors.onDark} fill={colors.onDark} size={18} strokeWidth={1.5} />
                ) : (
                  <Play color={colors.onDark} fill={colors.onDark} size={18} strokeWidth={1.5} style={{ marginStart: 2 }} />
                )}
              </Gradient>
            </Pressable>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <AppText variant="cardTitle">{t('audioTitle')}</AppText>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 18 }}>
                {WAVE.map((h, i) => (
                  <View
                    key={i}
                    style={{
                      width: 3,
                      height: h,
                      borderRadius: 2,
                      backgroundColor: i < waveOn ? colors[WAVE_ON[Math.min(i, WAVE_ON.length - 1)]] : colors.borderBlue,
                    }}
                  />
                ))}
              </View>
            </View>
            <AppText variant="caption" weight="bold" color="textMuted" style={{ writingDirection: 'ltr' }}>
              {audio.failed ? '⚠️' : `${clock(audio.pos)} / ${clock(audio.duration || AUDIO_SEC)}`}
            </AppText>
          </Card>

          {/* 2×2 KPI tiles */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            <KpiTile bg="greenTint" icon={<CircleCheck color={colors.green} size={18} strokeWidth={1.9} />}
              value={formatNumber(v.closed, lang)} label={t('closed')} />
            <KpiTile bg="primaryTint" icon={<Clock color={colors.primary} size={18} strokeWidth={1.9} />}
              value={pctText(v.onTime)} label={t('onTime')} />
            <KpiTile bg="purpleTint" icon={<Send color={colors.purple} size={18} strokeWidth={1.9} />}
              value={formatNumber(v.followups, lang)} label={t('autoFollowups')} />
            <KpiTile amber icon={<CircleCheck color={colors.onDark} size={18} strokeWidth={2.2} />}
              value={formatNumber(v.calls, lang)} label={t('yourCalls')} onPress={() => router.push('/04-decisions')} />
          </View>

          {/* Team pulse */}
          <Card padding={spacing.xxl} style={{ gap: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText variant="section">{t('pulse')}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('pulseHint')}
              </AppText>
            </View>
            {v.pulse.length === 0 && !tasks.isLoading && (
              <AppText variant="small" color="textMuted">
                {t('pulseEmpty')}
              </AppText>
            )}
            {v.pulse.map((r) => {
              const level = pulseLevel(r.rate);
              return (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <Avatar name={r.name} size={28} gradient={r.gradient} />
                  <AppText weight="semibold" numberOfLines={1} style={{ width: 74 }}>
                    {r.name}
                  </AppText>
                  <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden', flexDirection: 'row' }}>
                    <Gradient
                      name={level.gradient}
                      direction="horizontal"
                      style={{ width: `${r.rate}%`, borderRadius: 4, transform: [{ scaleX: isRTL ? -1 : 1 }] }}
                    />
                  </View>
                  <AppText variant="caption" weight="extrabold" color={level.fg} align="end" style={{ width: 40 }}>
                    {pctText(r.rate)}
                  </AppText>
                </View>
              );
            })}
          </Card>

          {/* Predictive suggestion */}
          {v.suggestion && (
            <SuggestionCard
              accepted={accepted}
              title={v.suggestion.kind === 'up'
                ? t('suggestUp', { name: v.suggestion.name, n: formatNumber(v.suggestion.n, lang) })
                : t('suggestTop', { name: v.suggestion.name, n: formatNumber(v.suggestion.n, lang) })}
              ask={t('suggestAsk')}
              pts={t('pts')}
              acceptA11y={t('acceptA11y', { name: v.suggestion.name })}
              acceptedText={t('accepted', { name: v.suggestion.name })}
              openLabel={t('openKudos')}
              onAccept={() => setAccepted(true)}
            />
          )}

          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 5 }}>
              <TrendingUp color={colors.greenText} size={13} strokeWidth={2.4} />
              <AppText variant="caption" weight="bold" color="greenText">
                {t('month', { h: formatNumber(v.monthH, lang, 1), sar: formatNumber(v.monthSar, lang) })}
              </AppText>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function GlassPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 }}>
      {icon}
      <AppText variant="small" weight="bold" color="onDark">
        {label}
      </AppText>
    </View>
  );
}

function KpiTile({ icon, value, label, bg = 'primaryTint', amber, onPress }: {
  icon: ReactNode; value: string; label: string; bg?: ColorToken; amber?: boolean; onPress?: () => void;
}) {
  const body = (
    <>
      {amber ? (
        <IconBadge size={36} gradient="warning">{icon}</IconBadge>
      ) : (
        <IconBadge size={36} bg={bg}>{icon}</IconBadge>
      )}
      <View style={{ flexShrink: 1 }}>
        <AppText weight="extrabold" color={amber ? 'amberStrong' : 'text'} style={{ fontSize: 22, lineHeight: 26 }}>
          {value}
        </AppText>
        <AppText variant="caption" color={amber ? 'amberStrong' : 'textMuted'} numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </>
  );
  const style = {
    flexBasis: '47%' as const,
    flexGrow: 1,
    minHeight: 58,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    backgroundColor: amber ? colors.amberTint : colors.surface,
    borderWidth: amber ? 1 : 0,
    borderColor: colors.gold,
    boxShadow: amber ? undefined : shadows.card,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${value} ${label}`} style={({ pressed }) => [style, { opacity: pressed ? 0.88 : 1 }]}>
        {body}
      </Pressable>
    );
  }
  return <View style={style}>{body}</View>;
}

function SuggestionCard({ accepted, title, ask, pts, acceptA11y, acceptedText, openLabel, onAccept }: {
  accepted: boolean; title: string; ask: string; pts: string; acceptA11y: string;
  acceptedText: string; openLabel: string; onAccept: () => void;
}) {
  const { isRTL } = useDirection();
  if (accepted) {
    return (
      <Card tone="green" padding={spacing.md} style={{ flexDirection: 'row', alignItems: 'center', paddingStart: spacing.lg }}>
        <IconBadge size={38} round gradient="success">
          <CircleCheck color={colors.onDark} size={18} strokeWidth={2.4} />
        </IconBadge>
        <AppText weight="bold" color="greenText" style={{ flex: 1 }}>
          {acceptedText}
        </AppText>
        <Pressable
          onPress={() => router.push('/28-kudos')}
          accessibilityRole="link"
          style={{ minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: spacing.md }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <AppText variant="small" weight="bold" color="primary">
              {openLabel}
            </AppText>
            <ChevronRight color={colors.primary} size={16} strokeWidth={2.4} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
          </View>
        </Pressable>
      </Card>
    );
  }
  return (
    <View style={{ borderRadius: radius.card, overflow: 'hidden', boxShadow: shadows.card, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingStart: spacing.lg, backgroundColor: colors.surface }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: '55%', backgroundColor: colors.orangeTint, opacity: 0.7, ...(isRTL ? { left: 0 } : { right: 0 }) }} />
        <IconBadge size={38} gradient="avatarBlue">
          <Sparkles color={colors.onDark} size={18} strokeWidth={1.9} />
        </IconBadge>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <AppText weight="bold" numberOfLines={1}>
            {title}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {ask}
          </AppText>
        </View>
        <Pressable
          onPress={onAccept}
          accessibilityRole="button"
          accessibilityLabel={acceptA11y}
          style={({ pressed }) => ({ minHeight: sizes.touch, borderRadius: radius.pill, boxShadow: shadows.primary, opacity: pressed ? 0.88 : 1 })}
        >
          <Gradient name="primary" style={{ minHeight: sizes.touch, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6, paddingStart: spacing.sm, paddingEnd: spacing.xl }}>
            <PointsCoin size={22} />
            <AppText variant="small" weight="extrabold" color="onDark">
              {pts}
            </AppText>
          </Gradient>
        </Pressable>
      </View>
    </View>
  );
}
