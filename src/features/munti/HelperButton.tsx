// Floating Munti (bottom-start, above the tab bar) on the main screens + the toast bubble for munti.say/celebrate.
// He pops up by himself ~1 s after a main screen opens (at most once per screen every 10 min) with a line about
// how things are going (performance.ts) + this screen's tip, then closes after a few seconds. Every other pop-up is
// about the value Muntej gave you this week (value.ts) with "Show me" → the weekly receipt (screen 32).
// On a Home screen he also gives a weekly recap (first open each Sunday) and cheers milestones (10+ follow-ups
// handled for you, 5+ on time in a row) — each once a week.
// His face AND colour follow that status (performance.ts): on fire = gold star eyes, good = green smile,
// watch out = amber worried, behind = red sad, overloaded = purple dizzy, nothing = grey sleepy. Every status names
// the tasks behind it and says how to cheer him up; when it changes he says so ("You turned me green! 💚").
// Tap → the same bubble again (+ "Show me"). Long-press → hidden until the app restarts.
// He is called Saree3 / سريع on screen; the "Ask Saree3" label next to him opens the chat.
// He also watches your finished tasks waiting for the manager and reacts to the answer (approved → cheer +
// bonus points, sent back → encouragement), live through Realtime.
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, Pressable, useWindowDimensions, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { AppText, Gradient } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { useDirection } from '@/lib/i18n';
import { Munti, MUNTI_SIZES, type MuntiMood } from './Munti';
import { MUNTI_NS, ROUTE_TIPS } from './tips';
import { munti, useMunti } from './store';
import { RANK, usePerformance, type Line, type PerfStatus } from './performance';
import { timeLabel, useWeekValue, type WeekValue } from './value';
import { formatNumber } from '@/features/home/value';
import { useMyProfile, useTasks, useTeam } from '@/lib/api';
import { wallet } from '@/features/rewards/wallet';

const FAB = MUNTI_SIZES.md;
const POP_DELAY_MS = 1000;
const POP_SHOW_MS = 6500;
const POP_AGAIN_MS = 10 * 60_000;
// when each screen last popped up by itself (this app session)
const lastPop = new Map<string, number>();
// auto pop-ups alternate: how it's going / the value this week
let popCount = 0;
const RECEIPT = '/32-receipt' as const;
const HOMES = ['/01-home', '/25-employee-home'];
const RECAP_MS = 9000;
const APPROVAL_BONUS = 10;
const TURN_EMOJI: Record<string, string> = { gold: '🔥', green: '💚', amber: '🙂', red: '😮', purple: '😮‍💨', grey: '😴', brand: '🙂' };
/** week number (weeks start Sunday, Riyadh time) for once-a-week moments */
const weekKey = () => Math.floor((Date.now() + 3 * 3_600_000 + 4 * 86_400_000) / (7 * 86_400_000));
const riyadhDay = () => new Date(Date.now() + 3 * 3_600_000).getUTCDay();

/** remembers (on the phone) that a once-a-week moment was shown */
async function firstTime(key: string) {
  try {
    if (await AsyncStorage.getItem(key)) return false;
    await AsyncStorage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}

/** Face while the bubble is closed / open. */
const REST: Record<PerfStatus, MuntiMood> = { great: 'star', good: 'idle', watch: 'oops', behind: 'sad', overloaded: 'dizzy', quiet: 'sleep' };
const SPEAK: Record<PerfStatus, MuntiMood> = { great: 'star', good: 'talk', watch: 'oops', behind: 'sad', overloaded: 'dizzy', quiet: 'sleep' };

export function HelperButton() {
  const { t } = useScreenT(MUNTI_NS);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { width: screenW } = useWindowDimensions();
  const { lang } = useDirection();
  const s = useMunti();
  const route = ROUTE_TIPS[pathname];
  const perf = usePerformance(lang);
  /** a status line in words; colour names inside (color_*) are translated too */
  const say = (l: Line | null | undefined) => {
    if (!l) return null;
    const vars: Record<string, unknown> = { ...l.vars };
    if (typeof vars.color === 'string') vars.color = t(vars.color);
    return t(l.key, vars);
  };
  const value = useWeekValue();
  const fmt = (n: number, d = 0) => formatNumber(n, lang, d);
  const time = value ? timeLabel(value.minutes, t, fmt) : '';
  /** the headline value line for this week (role-specific), or the nudge when there is none yet */
  const valueLine = (v: WeekValue | null) => {
    if (!v) return null;
    if (v.role === 'mgr') {
      if (v.chases > 0) return t('val_mgr', { n: fmt(v.chases), time });
      if (v.onTime > 0) return t('val_mgr_ontime', { n: fmt(v.onTime) });
    } else {
      if (v.reports > 0) return t('val_emp', { n: fmt(v.reports), time });
      if (v.onTime > 0) return t('val_emp_ontime', { n: fmt(v.onTime) });
    }
    return t('val_none');
  };
  const onTimeLine = (v: WeekValue | null) =>
    v && v.onTime > 0 && (v.role === 'mgr' ? v.chases > 0 : v.reports > 0)
      ? t(v.role === 'mgr' ? 'val_mgr_ontime' : 'val_emp_ontime', { n: fmt(v.onTime) })
      : null;

  // the manager's answer on what you finished: approved → cheer + bonus, sent back → encouragement
  const me = useMyProfile();
  const team = useTeam();
  const tasks = useTasks();
  const seen = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const meId = me.data?.id;
    if (!meId || !tasks.data) return;
    const mine = tasks.data.filter((x) => x.owner_id === meId);
    const prev = seen.current;
    seen.current = new Map(mine.map((x) => [x.id, x.status]));
    if (!prev) return; // first load: nothing changed yet
    for (const x of mine) {
      if (prev.get(x.id) !== 'submitted') continue;
      const who = x.assigner_id !== meId ? x.assigner_id : me.data?.manager_id;
      const p = who ? (team.data ?? []).find((y) => y.id === who) : undefined;
      const name = p ? ((lang === 'ar' && p.full_name_ar) || p.full_name).split(' ')[0] : '…';
      const action = { pathname: '/14-task-detail', params: { id: x.id } } as const;
      if (x.status === 'done') {
        wallet.earn(`approved:${x.id}`, APPROVAL_BONUS);
        munti.celebrate(t('rev_approved', { name, title: x.title, pts: fmt(APPROVAL_BONUS) }), { ms: RECAP_MS, action });
        break;
      }
      if (x.status === 'returned') {
        munti.say(t('rev_returned', { name, title: x.title }), 'talk', { ms: RECAP_MS, action });
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.data, me.data?.id]);

  // Home: weekly recap (Sunday, once) and milestones (once a week each) — after the pop-up has had its turn
  const valueReady = !!value;
  useEffect(() => {
    if (!value || !HOMES.includes(pathname) || !s.enabled || s.hidden) return;
    const wk = weekKey();
    const id = setTimeout(async () => {
      if (riyadhDay() === 0 && value.done + value.chases + value.reports > 0 && (await firstTime(`munti.recap.${wk}`))) {
        const text =
          value.role === 'mgr'
            ? t('recap_mgr', { chases: fmt(value.chases), done: fmt(value.done), ontime: fmt(value.onTime), time })
            : t('recap_emp', { done: fmt(value.done), ontime: fmt(value.onTime), reports: fmt(value.reports), time });
        return munti.celebrate(text, { ms: RECAP_MS, action: RECEIPT });
      }
      if (value.role === 'mgr' && value.chases >= 10 && (await firstTime(`munti.ms.chases.${wk}`))) {
        return munti.celebrate(t('ms_chases', { n: fmt(value.chases) }), { ms: RECAP_MS, action: RECEIPT });
      }
      if (value.streak >= 5 && (await firstTime(`munti.ms.streak.${wk}`))) {
        return munti.celebrate(t('ms_streak', { n: fmt(value.streak) }), { ms: RECAP_MS, action: RECEIPT });
      }
    }, POP_DELAY_MS + POP_SHOW_MS + 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueReady, pathname, s.enabled, s.hidden]);

  // status changed (a task finished, one went late): say so right away, cheering when it got better.
  // Waits a moment so a toast that caused it (e.g. "+15 pts") is seen first.
  const prevStatus = useRef<PerfStatus | null>(null);
  const perfStatus = perf?.status;
  useEffect(() => {
    if (!perf) return;
    const prev = prevStatus.current;
    prevStatus.current = perf.status;
    if (!prev || prev === perf.status) return;
    const better = RANK[perf.status] > RANK[prev];
    // better: "You turned me green! 💚" + what's true now; worse: the status line itself
    const text = better ? `${t('turned', { color: t(`color_${perf.tone}`), emoji: TURN_EMOJI[perf.tone] })} ${say(perf.message)}` : say(perf.message)!;
    const id = setTimeout(
      () => (better ? munti.celebrate(text, { ms: RECAP_MS }) : munti.say(text, perf.mood, { ms: RECAP_MS, action: perf.showMe ?? undefined })),
      4800,
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfStatus]);

  // 'auto' = popped up by himself (closes itself), 'tap' = opened by the user; 'value' = an auto pop-up about value
  const [open, setOpen] = useState<false | 'auto' | 'tap'>(false);
  const [popKind, setPopKind] = useState<'perf' | 'value'>('perf');
  const active = s.enabled && !s.hidden;

  // new main screen → pop up by himself after a moment, then close again
  useEffect(() => {
    setOpen(false);
    if (!active || !ROUTE_TIPS[pathname]?.fab) return;
    if (Date.now() - (lastPop.get(pathname) ?? 0) < POP_AGAIN_MS) return;
    let close: ReturnType<typeof setTimeout> | undefined;
    const pop = setTimeout(() => {
      lastPop.set(pathname, Date.now());
      setPopKind(popCount++ % 2 === 0 ? 'perf' : 'value');
      setOpen('auto');
      close = setTimeout(() => setOpen((o) => (o === 'auto' ? false : o)), POP_SHOW_MS);
    }, POP_DELAY_MS);
    return () => {
      clearTimeout(pop);
      clearTimeout(close);
    };
  }, [pathname, active]);

  if (!active) return null;

  const toast = s.toast;
  const showFab = !!route?.fab;
  if (!showFab && !toast && !(open && route)) return null;

  const fabBottom = (route?.tabBar ? sizes.tabBarHeight - 10 + Math.max(insets.bottom, 10) : insets.bottom) + spacing.lg;
  // bubble sits above the floating Munti; screens without it (the chat) show bubbles under the header instead.
  // Bubble and Munti are positioned separately with fixed sizes: nothing can stretch or push the other (Android).
  const bubbleAnchor = showFab ? { bottom: fabBottom + FAB + spacing.sm } : { top: insets.top + 84 };
  const bubbleW = Math.min(300, screenW - spacing.lg * 2);

  const tap = () => {
    if (toast) return munti.dismiss();
    setOpen((o) => (o ? false : 'tap'));
  };
  const hide = () => {
    munti.hideForSession();
    AccessibilityInfo.announceForAccessibility(t('hidden'));
  };

  // open bubble — tapped: how it's going + this week's value; auto: alternates how it's going (+ tip) / the value
  // status turn: the named status line + the second fact + how to cheer me up; value turn: the week's value
  const perfText = perf ? say(perf.message) : null;
  const vLine = valueLine(value);
  const valueTurn = open === 'auto' && popKind === 'value' && !!vLine;
  const bubbleText = toast ? toast.text : open && route ? (valueTurn ? vLine : (perfText ?? t(route.tip))) : null;
  const subLines: string[] =
    toast || !open || !route
      ? []
      : valueTurn
        ? [onTimeLine(value)].filter((x): x is string => !!x)
        : [say(perf?.extra), perf ? say(perf.cheer) : t(route.tip), open === 'tap' ? vLine : null].filter((x): x is string => !!x);
  const showMe = toast
    ? toast.action
    : !open
      ? undefined
      : valueTurn
        ? RECEIPT
        : (perf?.showMe ?? (open === 'tap' && vLine ? RECEIPT : route?.showMe));
  const fabMood: MuntiMood = toast ? toast.mood : perf ? (open ? SPEAK : REST)[perf.status] : open ? 'talk' : 'idle';
  const tone = perf?.tone ?? 'brand';

  return (
    <>
      {bubbleText && (
        <View
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            start: spacing.lg,
            ...bubbleAnchor,
            width: bubbleW,
            backgroundColor: colors.surface,
            borderRadius: radius.card,
            borderBottomStartRadius: showFab ? 6 : radius.card,
            borderWidth: 1,
            borderColor: colors.borderBlue,
            boxShadow: shadows.raised,
            paddingVertical: spacing.lg,
            paddingStart: spacing.xxl,
            paddingEnd: spacing.xs,
            gap: spacing.sm,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs }}>
            {!showFab && <Munti key={toast?.id} size="sm" tone={tone} mood={toast?.mood ?? 'talk'} settleAfter={2400} style={{ marginTop: 2 }} />}
            <View style={{ flex: 1, gap: spacing.xs, paddingTop: spacing.xs }}>
              <AppText weight={subLines.length ? 'semibold' : 'regular'} style={{ lineHeight: 20 }}>
                {bubbleText}
              </AppText>
              {subLines.map((line, i) => (
                <AppText key={i} variant="small" color={i === subLines.length - 1 && open === 'tap' ? 'textMuted' : 'textSoft'} style={{ lineHeight: 18 }}>
                  {line}
                </AppText>
              ))}
            </View>
            <Pressable
              onPress={() => (toast ? munti.dismiss() : setOpen(false))}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
              hitSlop={4}
              style={{ width: sizes.touch - 8, height: sizes.touch - 8, alignItems: 'center', justifyContent: 'center' }}
            >
              <X color={colors.textMuted} size={16} strokeWidth={2.2} />
            </Pressable>
          </View>
          {showMe && (
            <Pressable
              onPress={() => {
                setOpen(false);
                router.push(showMe);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('showMe')}
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
                height: sizes.touch,
                borderRadius: radius.pill,
                overflow: 'hidden',
                boxShadow: shadows.primary,
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Gradient
                name="primary"
                style={{ height: sizes.touch, paddingHorizontal: spacing.screen, alignItems: 'center', justifyContent: 'center' }}
              >
                <AppText weight="bold" color="onDark">
                  {t('showMe')}
                </AppText>
              </Gradient>
            </Pressable>
          )}
        </View>
      )}

      {showFab && (
        <Pressable
          onPress={tap}
          onLongPress={hide}
          delayLongPress={600}
          accessibilityRole="button"
          accessibilityLabel={t('name')}
          accessibilityHint={t('a11yHint')}
          accessibilityState={{ expanded: !!open }}
          accessibilityActions={[{ name: 'longpress', label: t('hide') }]}
          onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && hide()}
          style={({ pressed }) => ({
            position: 'absolute',
            start: spacing.lg,
            bottom: fabBottom,
            width: FAB,
            height: FAB,
            borderRadius: FAB / 2,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          })}
        >
          {/* new key per screen/toast → hops in again */}
          <Munti key={toast?.id ?? pathname} size="md" tone={tone} mood={fabMood} settleAfter={fabMood === 'talk' ? 2400 : undefined} />
        </Pressable>
      )}

      {/* "Ask Saree3": always there next to him (hidden while a bubble is open) → the chat */}
      {showFab && !bubbleText && (
        <Pressable
          onPress={() => router.push({ pathname: '/02-capture', params: { mode: 'text' } })}
          accessibilityRole="button"
          accessibilityLabel={t('askA11y')}
          style={({ pressed }) => ({
            position: 'absolute',
            start: spacing.lg + FAB - 4,
            bottom: fabBottom + (FAB - sizes.touch) / 2,
            minHeight: sizes.touch,
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View
            style={{
              paddingVertical: 6,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.borderBlue,
              boxShadow: shadows.tile,
            }}
          >
            <AppText variant="caption" weight="bold" color="primary">
              {t('ask')}
            </AppText>
          </View>
        </Pressable>
      )}
    </>
  );
}
