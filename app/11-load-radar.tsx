// Screen 11 · Load Radar — see design/v2/html/LoadRadar.dc.html (Arabic: LoadRadarAR.dc.html)
// Live data: useTeam (employees, weekly_capacity_hours, skills) + useTasks (active tasks due in/before this week →
// booked hours; done tasks → "did one like it"). The task being assigned comes from search params:
//   ?task=<id>  → live task (title, estimate, due) and "Send to X" really reassigns it + writes activity_log
//   ?title=&hours=&due=  → a new task (e.g. from Capture); "Send to X" shows a confirmation only
// No params → the design's demo task ("Competitor report", ~8 hrs). No team yet → the design's sample people.
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  CircleCheck,
  Clock,
  HeartPulse,
  Radar,
  Send,
  Sparkles,
  UserRound,
  type LucideProps,
} from 'lucide-react-native';
import { AppText, Avatar, BottomCTA, BOTTOM_CTA_SPACE, Card, IconBadge, IconButton } from '@/components/ui';
import { colors, radius, shadows, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTask, useTasks, useTeam } from '@/lib/api';
import { formatNumber, HOURLY_COST_SAR } from '@/features/home/value';
import { DAY_MS, startOfWeek } from '@/features/dashboard/metrics';
import { Stripes } from '@/features/roadmap/Stripes';
import { BAR_SCALE, bandOf, livePeople, rank, samplePeople, type Band, type RadarRow } from '@/features/load-radar/model';
import { useAssign } from '@/features/load-radar/useAssign';
import { NS } from '@/features/load-radar/strings';

const DEFAULT_HOURS = 8;

const BAND: Record<Band, { ring: ColorToken; text: ColorToken; tint: ColorToken }> = {
  ok: { ring: 'green', text: 'greenText', tint: 'greenTint' },
  near: { ring: 'amber', text: 'amberStrong', tint: 'amberTint' },
  over: { ring: 'red', text: 'red', tint: 'redTint' },
};

type Params = { task?: string; title?: string; hours?: string; due?: string };

const first = (n: string) => n.trim().split(/\s+/)[0] ?? n;

export default function LoadRadarScreen() {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<Params>();
  const taskId = typeof params.task === 'string' && params.task ? params.task : undefined;

  const team = useTeam();
  const tasks = useTasks();
  const task = useTask(taskId);
  const me = useMyProfile();
  const assign = useAssign();

  const [pick, setPick] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // ── the task being assigned ──
  const live = task.data;
  const paramHours = Number(params.hours);
  const hours = live?.estimate_hours ?? (Number.isFinite(paramHours) && paramHours > 0 ? paramHours : DEFAULT_HOURS);
  const title = live?.title ?? (typeof params.title === 'string' && params.title ? params.title : t('demoTitle'));
  const due = useMemo(() => {
    const iso = live?.due_at ?? (typeof params.due === 'string' ? params.due : undefined);
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? d : new Date(startOfWeek().getTime() + 7 * DAY_MS);
  }, [live?.due_at, params.due]);

  // ── people ──
  const employees = (team.data ?? []).filter((p) => p.role === 'employee');
  const sample = !team.isLoading && employees.length === 0;
  const rows: RadarRow[] = useMemo(() => {
    const people = sample
      ? samplePeople({ spl: t('demo.spl'), q3: t('demo.q3') })
      : livePeople(team.data ?? [], tasks.data ?? [], title, { excludeTaskId: taskId, currentOwnerId: live?.owner_id });
    return rank(people, hours);
  }, [sample, team.data, tasks.data, title, taskId, live?.owner_id, hours, t]);

  const sel = rows.find((r) => r.id === pick) ?? rows[0];
  const nameOf = (r: RadarRow) => first(lang === 'ar' ? r.nameAr : r.name);
  const addPct = sel ? Math.round((hours / sel.capacity) * 100) : 0;

  // ── note under each name ──
  const noteFor = (r: RadarRow): { text: string; Icon: ComponentType<LucideProps>; band: Band } => {
    if (r.recommended && r.why) {
      const why =
        r.why.kind === 'similar'
          ? t('why.similar', { month: t('monthsLong').split(',')[r.why.month] })
          : r.why.kind === 'skill'
            ? t('why.skill', { skill: t(`skills.${r.why.skill}`, { defaultValue: r.why.skill }) })
            : t('why.free');
      return { text: t('note.pick', { why }), Icon: Sparkles, band: bandOf(r.nowPct) };
    }
    if (r.overdue > 0) {
      return { text: r.overdue === 1 ? t('note.overdueOne') : t('note.overdue', { n: formatNumber(r.overdue, lang) }), Icon: AlertCircle, band: 'near' };
    }
    if (r.current) return { text: t('note.current'), Icon: UserRound, band: bandOf(r.nowPct) };
    const b = bandOf(r.nowPct);
    if (b === 'over') return { text: r.topTask ? t('note.busy', { task: r.topTask }) : t('note.busyPlain'), Icon: AlertTriangle, band: b };
    if (b === 'near') return { text: t('note.near'), Icon: Clock, band: b };
    return { text: t('note.free', { n: formatNumber(r.free, lang) }), Icon: CircleCheck, band: b };
  };

  // ── impact tip for the selected person ──
  const good = !!sel && sel.totalPct <= 100;
  const tip = (() => {
    if (!sel) return '';
    const pct = formatNumber(sel.totalPct, lang);
    if (sel.totalPct > 100) return sel.topTask ? t('tip.over', { pct, task: sel.topTask }) : t('tip.overPlain', { pct });
    if (sel.overdue > 0) return t('tip.overdue', { n: formatNumber(sel.overdue, lang) });
    if (sel.recommended) return t('tip.pick', { n: formatNumber(Math.max(0, Math.round(sel.capacity - sel.load - hours)), lang) });
    return t('tip.fits', { pct });
  })();

  // ── what this choice saves (vs. giving it to someone who would go over) ──
  const avoided = good && rows.some((r) => r !== sel && r.totalPct > 100) ? 1 : 0;
  const burnout = good ? 0 : 1;
  const sar = avoided ? Math.round((hours * HOURLY_COST_SAR) / 4) : 0;

  const dateLabel = t('dateFmt', {
    wd: t('days').split(',')[due.getDay()],
    d: formatNumber(due.getDate(), lang),
    m: (lang === 'ar' ? t('monthsLong') : t('months')).split(',')[due.getMonth()],
  });

  const send = () => {
    if (!sel) return;
    if (taskId && live && !sample && me.data) {
      assign.mutate(
        {
          taskId,
          taskTitle: live.title,
          meId: me.data.id,
          prevOwnerId: live.owner_id,
          to: { id: sel.id, name: sel.name, nameAr: sel.nameAr },
          totalPct: sel.totalPct,
        },
        { onSuccess: () => setSentTo(nameOf(sel)) },
      );
    } else {
      setSentTo(nameOf(sel));
    }
  };

  const loading = team.isLoading || (!!taskId && task.isLoading);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: BOTTOM_CTA_SPACE + spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* header */}
        <View style={{ paddingHorizontal: spacing.screen, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconButton label={t('back')} onPress={back}>
              <ChevronLeft color={colors.text} size={22} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
            </IconButton>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
              <IconBadge size={26} gradient="avatarBlue">
                <Radar color={colors.onDark} size={14} strokeWidth={2} />
              </IconBadge>
              <AppText variant="small" weight="bold" color="primary">
                {t('eyebrow')}
              </AppText>
            </View>
            {sample && <SampleTag label={t('sample')} />}
          </View>
          <AppText variant="titleLg" style={{ lineHeight: 32 }} numberOfLines={2}>
            {title}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <InfoPill icon={<Clock color={colors.purple} size={13} strokeWidth={2.2} />} label={t('hours', { n: formatNumber(hours, lang, hours % 1 ? 1 : 0) })} />
            <InfoPill icon={<CalendarDays color={colors.amberText} size={13} strokeWidth={2.2} />} label={dateLabel} />
          </View>
        </View>

        {/* legend */}
        <View style={{ marginTop: spacing.xl, marginBottom: spacing.sm, marginHorizontal: spacing.screen, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="micro" weight="bold" color="textMuted" style={{ letterSpacing: lang === 'ar' ? 0 : 0.4 }}>
            {t('loadWeek')}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {(['ok', 'near', 'over'] as Band[]).map((b) => (
              <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[BAND[b].ring] }} />
                <AppText variant="micro" color="textMuted">
                  {t(b)}
                </AppText>
              </View>
            ))}
          </View>
        </View>

        {/* people */}
        <View style={{ marginHorizontal: spacing.screen, gap: spacing.sm }}>
          {loading && <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xxl }} />}
          {!loading && rows.length === 0 && <AppText color="textMuted">{t('empty')}</AppText>}
          {!loading &&
            rows.map((r) => {
              const isSel = r.id === sel?.id;
              const shown = isSel ? r.totalPct : r.nowPct;
              const note = noteFor(r);
              const nb = BAND[note.band];
              const ring = BAND[bandOf(r.nowPct)].ring;
              const name = nameOf(r);
              return (
                <Pressable
                  key={r.id}
                  onPress={() => { setPick(r.id); setSentTo(null); }}
                  disabled={!!sentTo}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={t('a11yPerson', { name, pct: formatNumber(shown, lang) })}
                  style={({ pressed }) => ({
                    backgroundColor: isSel ? colors.primaryTint : colors.surface,
                    borderWidth: 1.5,
                    borderColor: isSel ? colors.primary : colors.surface,
                    borderRadius: radius.card,
                    paddingVertical: spacing.md,
                    paddingHorizontal: spacing.xl,
                    gap: 9,
                    boxShadow: shadows.card,
                    opacity: pressed ? 0.9 : 1,
                  })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
                    <View style={{ padding: 2, borderRadius: 24, borderWidth: 2, borderColor: colors[ring] }}>
                      <Avatar name={name} size={38} gradient={r.gradient} ring />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 3 }}>
                      <AppText variant="cardTitle" weight="bold" numberOfLines={1}>
                        {name}
                      </AppText>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%', backgroundColor: colors[nb.tint], borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                        <note.Icon color={colors[nb.text]} size={11} strokeWidth={2.4} />
                        <AppText variant="micro" weight="bold" color={nb.text} numberOfLines={1} style={{ flexShrink: 1 }}>
                          {note.text}
                        </AppText>
                      </View>
                    </View>
                    <AppText variant="lead" weight="extrabold" color={BAND[bandOf(shown)].text}>
                      {t('pct', { n: formatNumber(shown, lang) })}
                    </AppText>
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.track, flexDirection: 'row', overflow: 'hidden' }}>
                    <View style={{ width: `${(Math.min(r.nowPct, BAR_SCALE) / BAR_SCALE) * 100}%`, backgroundColor: colors[ring], borderTopStartRadius: 4, borderBottomStartRadius: 4 }} />
                    {isSel && r.nowPct < BAR_SCALE && (
                      <Stripes a="primary" b="borderDashed" style={{ width: `${(Math.min(addPct, BAR_SCALE - r.nowPct) / BAR_SCALE) * 100}%` }} />
                    )}
                  </View>
                </Pressable>
              );
            })}
        </View>

        {/* impact tip / confirmation */}
        {sel && !loading && (
          <View style={{ marginTop: spacing.lg, marginHorizontal: spacing.screen }}>
            {sentTo ? (
              <View style={{ borderRadius: radius.card, padding: spacing.md, paddingHorizontal: spacing.xl, flexDirection: 'row', gap: spacing.lg, alignItems: 'center', backgroundColor: colors.greenTint }}>
                <TipIcon><Send color={colors.green} size={17} strokeWidth={1.9} /></TipIcon>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText weight="bold" color="greenText">{t('sent', { name: sentTo })}</AppText>
                  <AppText variant="small" color="textSoft" style={{ lineHeight: 18 }}>
                    {taskId && !sample ? t('sentBody', { name: sentTo }) : t('previewBody')}
                  </AppText>
                </View>
              </View>
            ) : (
              <View style={{ borderRadius: radius.card, padding: spacing.md, paddingHorizontal: spacing.xl, flexDirection: 'row', gap: spacing.lg, alignItems: 'center', backgroundColor: good ? colors.greenTint : colors.redTint }}>
                <TipIcon><Sparkles color={good ? colors.green : colors.red} size={18} strokeWidth={1.8} /></TipIcon>
                <AppText weight="semibold" color={good ? 'greenText' : 'red'} style={{ flex: 1, lineHeight: 20 }}>
                  {tip}
                </AppText>
              </View>
            )}
            {assign.isError && (
              <AppText variant="small" color="red" style={{ marginTop: spacing.sm }}>
                {t('error')}
              </AppText>
            )}
          </View>
        )}

        {/* what it saves */}
        {sel && !loading && (
          <View style={{ marginTop: spacing.lg, marginHorizontal: spacing.screen, flexDirection: 'row', gap: spacing.sm }}>
            <MiniStat bg="primaryTint" icon={<CalendarCheck color={colors.primary} size={15} strokeWidth={2.2} />} value={formatNumber(avoided, lang)} label={t('stat.avoided')} />
            <MiniStat bg="redTint" icon={<HeartPulse color={colors.red} size={15} strokeWidth={2.2} />} value={formatNumber(burnout, lang)} label={t('stat.burnout')} />
            <MiniStat bg="greenTint" icon={<Banknote color={colors.green} size={15} strokeWidth={2.2} />} value={formatNumber(sar, lang)} label={t('stat.sar')} />
          </View>
        )}
      </ScrollView>

      {sel && !loading && (
        <BottomCTA
          primary={sentTo
            ? { label: t('done'), onPress: back }
            : sel.current
              ? { label: t('already', { name: nameOf(sel) }), disabled: true }
              : {
                  label: t('send', { name: nameOf(sel) }),
                  onPress: send,
                  loading: assign.isPending,
                  icon: <Send color={colors.onDark} size={20} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />,
                }}
        />
      )}
    </View>
  );
}

function InfoPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill, boxShadow: shadows.tile }}>
      {icon}
      <AppText variant="small" weight="semibold" color="textSoft">
        {label}
      </AppText>
    </View>
  );
}

function TipIcon({ children }: { children: ReactNode }) {
  return (
    <View style={{ width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', boxShadow: shadows.tile }}>
      {children}
    </View>
  );
}

function MiniStat({ bg, icon, value, label }: { bg: ColorToken; icon: ReactNode; value: string; label: string }) {
  return (
    <Card padding={0} style={{ flex: 1, minWidth: 0, borderRadius: radius.tile, paddingVertical: 9, paddingHorizontal: spacing.md, gap: 3, boxShadow: shadows.tile }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <IconBadge size={26} bg={bg}>{icon}</IconBadge>
        <AppText weight="extrabold" style={{ fontSize: 19 }}>
          {value}
        </AppText>
      </View>
      <AppText variant="micro" color="textMuted" numberOfLines={1}>
        {label}
      </AppText>
    </Card>
  );
}

function SampleTag({ label }: { label: string }) {
  return (
    <View style={{ backgroundColor: colors.chip, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
      <AppText variant="micro" weight="bold" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}
