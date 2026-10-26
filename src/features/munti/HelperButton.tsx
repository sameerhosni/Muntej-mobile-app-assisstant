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
// Drag him anywhere: he snaps to the nearest side and the phone remembers where; drop him on the ✕ to hide him.
// Support mode (support.ts): when something needs you he grows, his glow pulses red and a count shows; tapping him
// lists the top two things with their one-tap button (Open · Approve · Ask for more time · Tell Muntej).
// Living colour: his status colour, with a moment's flash for events (gold cheer, green done, blue while thinking).
// Tap → quick asks ("What needs me?", "How is my team?", "Add a task"). Hold → talk; let go → it goes to the chat.
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, Animated, Easing, PanResponder, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { CircleCheck, GraduationCap, History, Inbox, ListTodo, Lightbulb, MessageCircleQuestion, Plus, TriangleAlert, Users, X, type LucideProps } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { AppText, Gradient } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { useDirection } from '@/lib/i18n';
import { Munti, MUNTI_SIZES, type MuntiMood, type MuntiTone } from './Munti';
import { useSupport, type SupportItem } from './support';
import { useCompleteTask } from '@/features/tasks/useCompleteTask';
import { MicDeniedError, useVoiceRecorder } from '@/features/capture/useVoiceRecorder';
import { transcribeAudio } from '@/features/capture/api';
import { formatClock } from '@/features/capture/points';
import { featureUsed, useLaunchCardOn } from '@/features/launch/launch';
import { MUNTI_NS, ROUTE_TIPS } from './tips';
import { walkthrough } from '@/features/walkthrough/store';
import { WALK_NS } from '@/features/walkthrough/strings';
import { munti, useMunti } from './store';
import { useFamiliar } from './familiar';
import { RANK, usePerformance, type Line, type PerfStatus } from './performance';
import { timeLabel, useWeekValue, type WeekValue } from './value';
import { formatNumber } from '@/features/home/value';
import { useMyProfile, useTasks, useTeam } from '@/lib/api';
import { wallet } from '@/features/rewards/wallet';
import { supabase } from '@/lib/supabase';
import { JOBS_NS } from '@/features/saree3/strings';
import { openSupport } from '@/features/support/intercom';
import { SUPPORT_NS } from '@/features/support/strings';
import { IDEAS_NS } from '@/features/ideas/strings';

/** "I need more time" on a task someone gave you: a decision for them (checkin_reply need_time) */
async function askMoreTime(taskId: string) {
  const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: object) => PromiseLike<{ error: { message: string } | null }>;
  const { error } = await rpc('checkin_reply', { p_task: taskId, p_reply: 'need_time', p_note: null });
  if (error) throw new Error(error.message);
}

const FAB = MUNTI_SIZES.md;
/** support mode: about 50% bigger */
const SUPPORT_SCALE = 1.45;
/** the ✕ you drop him on to hide him */
const BIN = 64;
/** hold this long to start talking */
const HOLD_MS = 450;
/** where he sits: { side, ratio of the free height } */
const POS_KEY = 'munti.pos';
const nativeDriver = Platform.OS !== 'web';
/** glow colour per status colour (the body gradient's main colour) */
const TONE_GLOW: Record<MuntiTone, string> = {
  brand: colors.primary,
  gold: colors.gold,
  green: colors.green,
  amber: colors.amber,
  red: colors.red,
  purple: colors.purple,
  grey: colors.textFaint,
};
const POP_DELAY_MS = 1000;
const POP_SHOW_MS = 6500;
// pops up by himself at most once per screen per day (remembered on the phone)
const todayKey = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
// "Ask Saree3" label: first 7 days, or until it has been tapped once
const ASK_DAYS = 7;
// when each screen last popped up by itself (this app session)
const lastPop = new Map<string, number>();
// auto pop-ups alternate: how it's going / the value this week
let popCount = 0;
const RECEIPT = '/32-receipt' as const;
const AUTO_POP = false;
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

/** colour + icon per thing that needs you (decision purple, tools blue, review green, late red, blocked amber) */
const KIND_LOOK: Record<
  SupportItem['kind'],
  { Icon: ComponentType<LucideProps>; bg: 'purpleTint' | 'primaryTint' | 'greenTint' | 'redTint' | 'amberTint'; fg: string }
> = {
  decisions: { Icon: CircleCheck, bg: 'purpleTint', fg: colors.purple },
  incoming: { Icon: Inbox, bg: 'primaryTint', fg: colors.primary },
  review: { Icon: CircleCheck, bg: 'greenTint', fg: colors.green },
  late: { Icon: History, bg: 'redTint', fg: colors.red },
  blocked: { Icon: TriangleAlert, bg: 'amberTint', fg: colors.amberText },
};

export function HelperButton() {
  const { t } = useScreenT(MUNTI_NS);
  const { t: tj } = useScreenT(JOBS_NS);
  const { t: tw } = useScreenT(WALK_NS);
  const { t: ts } = useScreenT(SUPPORT_NS);
  const { t: ti } = useScreenT(IDEAS_NS);
  const { t: tg } = useTranslation();
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
    const id = setTimeout(
      async () => {
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
      },
      POP_DELAY_MS + POP_SHOW_MS + 600,
    );
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
    const text = better
      ? `${t('turned', { color: t(`color_${perf.tone}`), emoji: TURN_EMOJI[perf.tone] })} ${say(perf.message)}`
      : say(perf.message)!;
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

  // new main screen → used to pop up by himself once per screen per day. Off (owner: too much talk): each screen now
  // teaches itself once with Saree3's walkthrough; tapping Saree3 still opens him.
  useEffect(() => {
    setOpen(false);
    if (!AUTO_POP || !active || !ROUTE_TIPS[pathname]?.fab || lastPop.has(pathname)) return;
    let close: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const pop = setTimeout(async () => {
      if (!(await firstTime(`munti.pop.${pathname}.${todayKey()}`)) || cancelled) return;
      lastPop.set(pathname, Date.now());
      setPopKind(popCount++ % 2 === 0 ? 'perf' : 'value');
      setOpen('auto');
      close = setTimeout(() => setOpen((o) => (o === 'auto' ? false : o)), POP_SHOW_MS);
    }, POP_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(pop);
      clearTimeout(close);
    };
  }, [pathname, active]);

  // "Ask Saree3" label only while it's new: first 7 days, or until tapped once
  const [showAsk, setShowAsk] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        if (await AsyncStorage.getItem('munti.ask.used')) return;
        let since = await AsyncStorage.getItem('munti.ask.since');
        if (!since) {
          since = String(Date.now());
          await AsyncStorage.setItem('munti.ask.since', since);
        }
        setShowAsk(Date.now() - Number(since) < ASK_DAYS * 86_400_000);
      } catch {
        setShowAsk(false);
      }
    })();
  }, []);
  const askUsed = () => {
    setShowAsk(false);
    AsyncStorage.setItem('munti.ask.used', '1').catch(() => {});
  };

  // ── support mode: what needs this person (bigger, pulsing, count badge, one-tap actions) ──
  const support = useSupport();
  // a "New for you" card is on screen: his own pop-up waits
  const launchOn = useLaunchCardOn();
  const { toggle: completeTask } = useCompleteTask();
  const supportOn = support.count > 0;
  // drawn smaller once they know him (2–3 days of use, most options tried); back to full size when something needs them
  const familiar = useFamiliar();
  const drawn = supportOn ? 1 : familiar.scale;

  // ── where he sits: dragged anywhere, snaps to the nearest side, remembered on the phone ──
  const { height: screenH } = useWindowDimensions();
  const { isRTL } = useDirection();
  const fabBottom = (route?.tabBar ? sizes.tabBarHeight - 10 + Math.max(insets.bottom, 10) : insets.bottom) + spacing.lg;
  const minTop = insets.top + spacing.sm;
  const maxTop = screenH - fabBottom - FAB;
  const [pos, setPos] = useState<{ side: 'left' | 'right'; ratio: number } | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(POS_KEY)
      .then((v) => v && setPos(JSON.parse(v)))
      .catch(() => {});
  }, []);
  const side = pos?.side ?? (isRTL ? 'right' : 'left');
  const top = pos ? minTop + pos.ratio * Math.max(0, maxTop - minTop) : maxTop;
  const baseLeft = side === 'left' ? spacing.lg : screenW - FAB - spacing.lg;

  const pan = useRef(new Animated.ValueXY()).current;
  const [dragging, setDragging] = useState(false);
  const [overBin, setOverBin] = useState(false);
  const binY = screenH - fabBottom - BIN / 2 - spacing.xxl;
  const talking = useRef(false);
  // the pan handler is made once: it reads where things are NOW from this ref (the ✕ moves with the tab bar / screen)
  const geo = useRef({ baseLeft, top, minTop, maxTop, screenW, binY, hide: () => {} });
  geo.current = { baseLeft, top, minTop, maxTop, screenW, binY, hide: () => hide() };
  // a generous drop zone: anywhere on or around the ✕ counts
  const nearBin = (x: number, y: number) => Math.hypot(x - geo.current.screenW / 2, y - geo.current.binY) < BIN * 1.3;
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => !talking.current && Math.hypot(g.dx, g.dy) > 6,
      onPanResponderGrant: () => {
        setDragging(true);
        setOpen(false);
      },
      onPanResponderMove: (_e, g) => {
        pan.setValue({ x: g.dx, y: g.dy });
        setOverBin(nearBin(g.moveX, g.moveY));
      },
      onPanResponderRelease: (_e, g) => {
        setDragging(false);
        setOverBin(false);
        pan.setValue({ x: 0, y: 0 });
        if (nearBin(g.moveX, g.moveY)) return geo.current.hide();
        const c = geo.current;
        const centerX = c.baseLeft + g.dx + FAB / 2;
        const nextTop = Math.min(c.maxTop, Math.max(c.minTop, c.top + g.dy));
        const next = {
          side: centerX < c.screenW / 2 ? ('left' as const) : ('right' as const),
          ratio: (nextTop - c.minTop) / Math.max(1, c.maxTop - c.minTop),
        };
        setPos(next);
        AsyncStorage.setItem(POS_KEY, JSON.stringify(next)).catch(() => {});
        featureUsed('saree3');
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        setOverBin(false);
        pan.setValue({ x: 0, y: 0 });
      },
    }),
  ).current;

  // ── size + pulse: grows in support mode, the glow breathes (faster and stronger when he needs you) ──
  const grow = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(grow, { toValue: supportOn ? SUPPORT_SCALE : 1, friction: 5, useNativeDriver: nativeDriver }).start();
  }, [supportOn, grow]);
  useEffect(() => {
    const ms = supportOn ? 700 : 1800;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: nativeDriver }),
        Animated.timing(pulse, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [supportOn, pulse]);

  // ── hold to talk: hold him, speak, let go → the chat gets it ──
  const recorder = useVoiceRecorder();
  const [talk, setTalk] = useState<'idle' | 'recording' | 'thinking'>('idle');
  const startTalk = async () => {
    if (talking.current) return;
    talking.current = true;
    familiar.note('talk');
    setOpen(false);
    munti.dismiss();
    setTalk('recording');
    munti.flash('brand', 60_000);
    try {
      await recorder.start();
      featureUsed('saree3');
    } catch (e) {
      talking.current = false;
      setTalk('idle');
      munti.endFlash();
      munti.say(e instanceof MicDeniedError ? tg('capture.micDenied') : tg('capture.failed'), 'oops');
    }
  };
  const stopTalk = async () => {
    if (!talking.current) return;
    talking.current = false;
    const duration = recorder.durationMillis;
    setTalk('thinking');
    const uri = await recorder.stop().catch(() => null);
    if (!uri || duration < 800 || recorder.wasSilent()) {
      setTalk('idle');
      munti.endFlash();
      return munti.say(t(duration < 800 ? 'talk_short' : 'talk_silent'), 'oops');
    }
    try {
      const text = (await transcribeAudio(uri)).trim();
      setTalk('idle');
      munti.endFlash();
      if (text) router.push({ pathname: '/02-capture', params: { mode: 'text', say: text, via: 'voice' } });
    } catch {
      setTalk('idle');
      munti.endFlash();
      munti.say(tg('capture.failed'), 'oops');
    }
  };

  if (!active) return null;

  const toast = s.toast;
  const showFab = !!route?.fab;
  if (!showFab && !toast && !(open && route)) return null;

  const size = FAB * (supportOn ? SUPPORT_SCALE : 1);
  // bubble near him: above when he sits in the lower half, below otherwise; on his side of the screen
  const bubbleW = Math.min(320, screenW - spacing.lg * 2);
  const bubbleAnchor = showFab
    ? {
        ...(side === 'left' ? { left: spacing.lg } : { right: spacing.lg }),
        ...(top > screenH / 2 ? { bottom: screenH - top + (size - FAB) / 2 + spacing.sm } : { top: top + FAB + (size - FAB) / 2 + spacing.sm }),
      }
    : { start: spacing.lg, top: insets.top + 84 };

  const tap = () => {
    if (toast) return munti.dismiss();
    setOpen((o) => (o ? false : 'tap'));
  };
  const hide = () => {
    munti.hideForSession();
    AccessibilityInfo.announceForAccessibility(t('hidden'));
  };
  const go = (href: Href) => {
    setOpen(false);
    router.push(href);
  };
  const ask = (msg: string) => go({ pathname: '/02-capture', params: { mode: 'text', say: msg } });

  // open bubble — tapped: how it's going + this week's value; auto: alternates how it's going (+ tip) / the value
  // status turn: the named status line + the second fact + how to cheer me up; value turn: the week's value
  const perfText = perf ? say(perf.message) : null;
  const vLine = valueLine(value);
  const valueTurn = open === 'auto' && popKind === 'value' && !!vLine;
  const supportTurn = !!open && !toast && supportOn;
  const bubbleText = toast
    ? toast.text
    : talk === 'recording'
      ? t('talk_listening')
      : talk === 'thinking'
        ? t('talk_thinking')
        : open && route
          ? supportTurn
            ? t('sup_head', { count: support.count, n: fmt(support.count) })
            : valueTurn
              ? vLine
              : (perfText ?? t(route.tip))
          : null;
  // max 2 lines: the status + ONE action (the second fact if there is one, else how to cheer me up)
  const subLines: string[] =
    toast || !open || !route || supportTurn || talk !== 'idle'
      ? []
      : valueTurn
        ? []
        : [perf ? (say(perf.extra) ?? say(perf.cheer)) : t(route.tip)].filter((x): x is string => !!x);
  const showMe = toast
    ? toast.action
    : !open || supportTurn || talk !== 'idle'
      ? undefined
      : valueTurn
        ? RECEIPT
        : (perf?.showMe ?? (open === 'tap' && vLine ? RECEIPT : route?.showMe));
  const fabMood: MuntiMood =
    talk === 'recording'
      ? 'talk'
      : talk === 'thinking'
        ? 'think'
        : toast
          ? toast.mood
          : perf
            ? (open ? SPEAK : REST)[perf.status]
            : open
              ? 'talk'
              : 'idle';
  // colour: a moment's flash (cheer / done / thinking) on top of his status colour
  const tone: MuntiTone = s.flash?.tone ?? perf?.tone ?? 'brand';
  const glow = TONE_GLOW[tone];

  /** one support row: what it is + its one-tap button */
  const supportRow = (it: SupportItem) => {
    // each kind has its colour and icon, so a glance tells what it is (owner: "more creative and coloured")
    const look = KIND_LOOK[it.kind];
    const row = (text: string, btn: string, onPress: () => void, link?: Href) => (
      <View
        key={it.key}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.tile, backgroundColor: colors[look.bg] }}
      >
        <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
          <look.Icon color={look.fg} size={16} strokeWidth={2.4} />
        </View>
        <AppText variant="small" weight="semibold" numberOfLines={2} onPress={link ? () => go(link) : undefined} style={{ flex: 1 }}>
          {text}
        </AppText>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${btn}: ${text}`}
          style={({ pressed }) => ({
            minHeight: sizes.touch - 8,
            paddingHorizontal: spacing.md,
            borderRadius: radius.pill,
            justifyContent: 'center',
            backgroundColor: look.fg,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <AppText variant="small" weight="bold" color="onDark" numberOfLines={1}>
            {btn}
          </AppText>
        </Pressable>
      </View>
    );
    switch (it.kind) {
      case 'decisions':
        return row(t('sup_decisions', { count: it.n, n: fmt(it.n) }), t('sup_open'), () => go(it.href));
      case 'incoming':
        return row(t('sup_incoming', { count: it.n, n: fmt(it.n) }), t('sup_open'), () => go(it.href));
      case 'review': {
        const task = (tasks.data ?? []).find((x) => x.id === it.taskId);
        return row(
          t('sup_review', { name: it.name, title: it.title }),
          t('sup_approve'),
          () => {
            setOpen(false);
            if (task) completeTask(task);
          },
          { pathname: '/15-review', params: { id: it.taskId } },
        );
      }
      case 'late': {
        // someone gave it to you → Saree3 asks them for you (a decision for them, the answer comes back to you);
        // your own task → just move it, in the chat locked on THAT task (two tasks can share a title)
        const task = (tasks.data ?? []).find((x) => x.id === it.taskId);
        const given = !!task?.assigner_id && task.assigner_id !== me.data?.id;
        return row(
          t('sup_late', { title: it.title }),
          given ? t('sup_moreTime') : t('sup_moveIt'),
          given
            ? () => {
                setOpen(false);
                askMoreTime(it.taskId)
                  .then(() => munti.say(t('sup_asked'), 'celebrate'))
                  .catch(() => munti.say(tg('capture.failed'), 'oops'));
              }
            : () => go({ pathname: '/02-capture', params: { mode: 'text', focus: it.taskId, say: t('ask_moveIt') } }),
          { pathname: '/14-task-detail', params: { id: it.taskId } },
        );
      }
      case 'blocked':
        return row(t('sup_blocked', { title: it.title }), t('sup_tell'), () =>
          go({ pathname: '/02-capture', params: { mode: 'text', focus: it.taskId, draft: t('draft_blocked', { title: it.title }) } }),
        );
    }
  };
  const quick = [
    // "What happened?": everything Saree3 is handling, and the state of each
    { key: 'happened', label: tj('whatHappened'), Icon: History, bg: 'purpleTint' as const, fg: colors.purple, run: () => go('/54-saree3' as Href) },
    { key: 'needs', label: t('q_needs'), Icon: Inbox, bg: 'redTint' as const, fg: colors.red, run: () => ask(t('q_needs_msg')) },
    me.data?.role === 'employee'
      ? { key: 'next', label: t('q_next'), Icon: ListTodo, bg: 'greenTint' as const, fg: colors.green, run: () => ask(t('q_next_msg')) }
      : { key: 'team', label: t('q_team'), Icon: Users, bg: 'greenTint' as const, fg: colors.green, run: () => ask(t('q_team_msg')) },
    { key: 'add', label: t('q_add'), Icon: Plus, bg: 'primaryTint' as const, fg: colors.primary, run: () => go({ pathname: '/02-capture', params: { mode: 'text' } }) },
    // an idea or a note about the screen you're on (owner, 26 Oct: feedback and wish list)
    {
      key: 'idea',
      label: ti('row'),
      Icon: Lightbulb,
      bg: 'amberTint' as const,
      fg: colors.amberText,
      run: () => go(`/59-ideas?from=${encodeURIComponent(pathname.replace(/^\/+/, '') || 'home')}` as Href),
    },
    // the Muntej team (owner, 26 Oct: back in Saree3's menu now that the chat opens inside the app)
    {
      key: 'support',
      label: ts('talk'),
      Icon: MessageCircleQuestion,
      bg: 'greenTint' as const,
      fg: colors.green,
      run: () => {
        setOpen(false);
        openSupport().then((err) => err && munti.say(`⚠️ ${err}`));
      },
    },
    // replay this screen's walkthrough (Saree3 lights up what matters here again)
    ...(walkthrough.canReplay()
      ? [
          {
            key: 'teach',
            label: tw('teachPage'),
            Icon: GraduationCap,
            bg: 'amberTint' as const,
            fg: colors.amberText,
            run: () => {
              setOpen(false);
              setTimeout(() => walkthrough.replay(), 250);
            },
          },
        ]
      : []),
  ];

  return (
    <>
      {bubbleText && !dragging && !launchOn && (
        <View
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            ...bubbleAnchor,
            width: bubbleW,
            backgroundColor: colors.surface,
            borderRadius: radius.cardLg,
            overflow: 'hidden',
            boxShadow: shadows.raised,
          }}
        >
          {/* his colour on top: Saree3 and what he says (purple-blue normally, warm amber when things need you) */}
          <Gradient
            name={supportTurn ? 'warning' : 'purple'}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, paddingStart: spacing.lg }}
          >
            {!showFab && <Munti key={toast?.id} size="sm" tone={tone} mood={toast?.mood ?? 'talk'} settleAfter={2400} />}
            <View style={{ flex: 1, gap: 2, paddingTop: spacing.xs }}>
              <AppText weight="bold" color="onDark" style={{ lineHeight: 21 }}>
                {bubbleText}
              </AppText>
              {subLines.map((line, i) => (
                <AppText key={i} variant="small" color="onDarkMuted" style={{ lineHeight: 18 }}>
                  {line}
                </AppText>
              ))}
            </View>
            {talk === 'idle' && (
              <Pressable
                onPress={() => (toast ? munti.dismiss() : setOpen(false))}
                accessibilityRole="button"
                accessibilityLabel={t('close')}
                hitSlop={4}
                style={{ width: sizes.touch - 8, height: sizes.touch - 8, alignItems: 'center', justifyContent: 'center' }}
              >
                <X color={colors.onDark} size={18} strokeWidth={2.4} />
              </Pressable>
            )}
          </Gradient>
          <View style={{ padding: spacing.md, gap: spacing.sm }}>
          {supportTurn && <View style={{ gap: spacing.sm }}>{support.items.slice(0, 3).map(supportRow)}</View>}
          {showMe && (
            <Pressable
              onPress={() => go(showMe)}
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
          {/* quick asks when you tapped him: straight into the chat */}
          {open === 'tap' && !toast && talk === 'idle' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {quick.map((q) => (
                <Pressable
                  key={q.key}
                  onPress={() => {
                    familiar.note(q.key);
                    q.run();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={q.label}
                  style={({ pressed }) => ({
                    flexBasis: '30%',
                    flexGrow: 1,
                    minHeight: 64,
                    padding: spacing.sm,
                    borderRadius: radius.tile,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    backgroundColor: colors[q.bg],
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <q.Icon color={q.fg} size={18} strokeWidth={2.3} />
                  <AppText variant="micro" weight="bold" align="center" numberOfLines={2} style={{ color: q.fg }}>
                    {q.label}
                  </AppText>
                </Pressable>
              ))}
            </View>
          )}
          {open === 'tap' && !toast && talk === 'idle' && (
            // the hint is Saree3 talking in a small bubble, not grey small print
            <View style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted }}>
              <AppText variant="caption" color="textSoft">
                {t('holdHint')}
              </AppText>
            </View>
          )}
          </View>
        </View>
      )}

      {/* drop him here to hide him (only while dragging) */}
      {dragging && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: screenW / 2 - BIN / 2,
            top: binY - BIN / 2,
            width: BIN,
            height: BIN,
            borderRadius: BIN / 2,
            backgroundColor: overBin ? colors.red : 'rgba(11,26,51,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: overBin ? 1.15 : 1 }],
          }}
        >
          <X color={colors.onDark} size={26} strokeWidth={2.4} />
        </View>
      )}

      {showFab && (
        <Animated.View
          {...responder.panHandlers}
          style={{
            position: 'absolute',
            left: baseLeft,
            top,
            width: FAB,
            height: FAB,
            transform: [...pan.getTranslateTransform(), { scale: grow }],
          }}
        >
          {/* breathing glow in his colour: stronger and faster in support mode */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: (FAB - (FAB * drawn + 20)) / 2,
              top: (FAB - (FAB * drawn + 20)) / 2,
              width: FAB * drawn + 20,
              height: FAB * drawn + 20,
              borderRadius: (FAB * drawn + 20) / 2,
              backgroundColor: supportOn ? colors.red : glow,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: supportOn ? [0.12, 0.42] : [0.06, 0.2] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, supportOn ? 1.18 : 1.06] }) }],
            }}
          />
          <Pressable
            onPress={tap}
            onLongPress={startTalk}
            onPressOut={() => talking.current && stopTalk()}
            delayLongPress={HOLD_MS}
            accessibilityRole="button"
            accessibilityLabel={supportOn ? `${t('name')}. ${t('sup_head', { count: support.count, n: fmt(support.count) })}` : t('name')}
            accessibilityHint={t('a11yHint')}
            accessibilityState={{ expanded: !!open }}
            accessibilityActions={[{ name: 'longpress', label: t('hide') }]}
            onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && hide()}
            style={{ width: FAB, height: FAB, borderRadius: FAB / 2 }}
          >
            {/* new key per screen/toast → hops in again */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ scale: drawn }] }}>
              <Munti
                key={toast?.id ?? pathname}
                size="md"
                tone={tone}
                mood={fabMood}
                settleAfter={fabMood === 'talk' && talk === 'idle' ? 2400 : undefined}
              />
            </View>
          </Pressable>
          {supportOn && talk === 'idle' && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                minWidth: 20,
                height: 20,
                borderRadius: 10,
                paddingHorizontal: 4,
                backgroundColor: colors.red,
                borderWidth: 2,
                borderColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText weight="extrabold" color="onDark" style={{ fontSize: 10, lineHeight: 12 }}>
                {fmt(Math.min(support.count, 99))}
              </AppText>
            </View>
          )}
          {talk === 'recording' && (
            <View pointerEvents="none" style={{ position: 'absolute', top: FAB + 4, left: -spacing.xl, right: -spacing.xl, alignItems: 'center' }}>
              <AppText variant="micro" weight="extrabold" color="primary" style={{ writingDirection: 'ltr' }}>
                {formatClock(recorder.durationMillis)}
              </AppText>
            </View>
          )}
        </Animated.View>
      )}

      {/* "Ask Saree3": next to him while it's new (hidden while a bubble is open or he's busy) */}
      {showFab && showAsk && !bubbleText && !dragging && talk === 'idle' && (
        <Pressable
          onPress={() => {
            askUsed();
            router.push({ pathname: '/02-capture', params: { mode: 'text' } });
          }}
          accessibilityRole="button"
          accessibilityLabel={t('askA11y')}
          style={({ pressed }) => ({
            position: 'absolute',
            ...(side === 'left' ? { left: baseLeft + size + 4 } : { right: screenW - baseLeft + (size - FAB) / 2 + 4 }),
            top: top + (FAB - sizes.touch) / 2,
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
