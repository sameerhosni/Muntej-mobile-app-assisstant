// Floating Munti (bottom-start, above the tab bar) on the main screens + the toast bubble for munti.say/celebrate.
// He pops up by himself ~1 s after a main screen opens (at most once per screen every 10 min) with a line about
// how things are going (performance.ts) + this screen's tip, then closes after a few seconds.
// His face follows that status: on fire = star eyes, good = happy, late = worried, way behind = sad, nothing = sleepy.
// Tap → the same bubble again (+ "Show me"). Long-press → hidden until the app restarts.
import { useEffect, useState } from 'react';
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
import { usePerformance, type PerfStatus } from './performance';

const FAB = MUNTI_SIZES.md;
const POP_DELAY_MS = 1000;
const POP_SHOW_MS = 6500;
const POP_AGAIN_MS = 10 * 60_000;
// when each screen last popped up by itself (this app session)
const lastPop = new Map<string, number>();

/** Face while the bubble is closed / open. */
const REST: Record<PerfStatus, MuntiMood> = { great: 'star', good: 'idle', watch: 'oops', behind: 'sad', quiet: 'sleep' };
const SPEAK: Record<PerfStatus, MuntiMood> = { great: 'star', good: 'talk', watch: 'oops', behind: 'sad', quiet: 'sleep' };

export function HelperButton() {
  const { t } = useScreenT(MUNTI_NS);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { width: screenW } = useWindowDimensions();
  const { lang } = useDirection();
  const s = useMunti();
  const route = ROUTE_TIPS[pathname];
  const perf = usePerformance(lang);

  // 'auto' = popped up by himself (closes itself), 'tap' = opened by the user
  const [open, setOpen] = useState<false | 'auto' | 'tap'>(false);
  const active = s.enabled && !s.hidden;

  // new main screen → pop up by himself after a moment, then close again
  useEffect(() => {
    setOpen(false);
    if (!active || !ROUTE_TIPS[pathname]?.fab) return;
    if (Date.now() - (lastPop.get(pathname) ?? 0) < POP_AGAIN_MS) return;
    let close: ReturnType<typeof setTimeout> | undefined;
    const pop = setTimeout(() => {
      lastPop.set(pathname, Date.now());
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

  // open bubble: how it's going (when known) + this screen's tip underneath
  const perfText = perf ? t(perf.message, perf.vars) : null;
  const bubbleText = toast ? toast.text : open && route ? (perfText ?? t(route.tip)) : null;
  const subText = !toast && open && route && perfText ? t(route.tip) : null;
  const lateTasks = { pathname: '/38-tasks', params: { filter: 'late' } } as const;
  const showMe = toast || !open ? undefined : perf?.showLate ? lateTasks : route?.showMe;
  const fabMood: MuntiMood = toast ? toast.mood : perf ? (open ? SPEAK : REST)[perf.status] : open ? 'talk' : 'idle';

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
            {!showFab && <Munti key={toast?.id} size="sm" mood={toast?.mood ?? 'talk'} settleAfter={2400} style={{ marginTop: 2 }} />}
            <View style={{ flex: 1, gap: spacing.xs, paddingTop: spacing.xs }}>
              <AppText weight={subText ? 'semibold' : 'regular'} style={{ lineHeight: 20 }}>
                {bubbleText}
              </AppText>
              {subText && (
                <AppText variant="small" color="textMuted" style={{ lineHeight: 18 }}>
                  {subText}
                </AppText>
              )}
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
          <Munti key={toast?.id ?? pathname} size="md" mood={fabMood} settleAfter={fabMood === 'talk' ? 2400 : undefined} />
        </Pressable>
      )}
    </>
  );
}
