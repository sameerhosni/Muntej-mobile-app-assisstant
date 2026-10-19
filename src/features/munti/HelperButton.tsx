// Floating Munti (bottom-start, above the tab bar) on the main screens + the toast bubble for munti.say/celebrate.
// Tap → speech bubble with this screen's tip (+ optional "Show me"). Long-press → hidden until the app restarts.
// Munti dozes off after a while with no taps; a tap wakes him with a wave.
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { AppText, Button } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { Munti, MUNTI_SIZES, type MuntiMood } from './Munti';
import { MUNTI_NS, ROUTE_TIPS } from './tips';
import { munti, useMunti } from './store';

const SLEEP_AFTER_MS = 45_000;
const FAB = MUNTI_SIZES.md;

export function HelperButton() {
  const { t } = useScreenT(MUNTI_NS);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const s = useMunti();
  const route = ROUTE_TIPS[pathname];

  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<MuntiMood>('wave');

  // new screen → close the tip, say hi, then doze off if nobody taps
  useEffect(() => {
    setOpen(false);
    setMood('wave');
    const calm = setTimeout(() => setMood('idle'), 1600);
    const nap = setTimeout(() => setMood('sleep'), SLEEP_AFTER_MS);
    return () => {
      clearTimeout(calm);
      clearTimeout(nap);
    };
  }, [pathname]);

  if (!s.enabled || s.hidden) return null;

  const toast = s.toast;
  const showFab = !!route?.fab;
  if (!showFab && !toast && !(open && route)) return null;

  const fabBottom = (route?.tabBar ? sizes.tabBarHeight - 10 + Math.max(insets.bottom, 10) : insets.bottom) + spacing.lg;
  // screens without the floating Munti (the chat) show bubbles under the header instead
  const anchor = showFab ? { bottom: fabBottom } : { top: insets.top + 84 };

  const tap = () => {
    if (toast) return munti.dismiss();
    setOpen((o) => !o);
    setMood('idle'); // wakes him up; the open bubble makes him talk for a moment
  };
  const hide = () => {
    munti.hideForSession();
    AccessibilityInfo.announceForAccessibility(t('hidden'));
  };

  const bubbleText = toast ? toast.text : open && route ? t(route.tip) : null;
  const showMe = !toast && open ? route?.showMe : undefined;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', start: spacing.lg, end: spacing.lg, ...anchor, alignItems: 'flex-start', gap: spacing.sm }}
    >
      {bubbleText && (
        <View
          accessibilityLiveRegion="polite"
          style={{
            maxWidth: 300,
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
            <AppText style={{ flex: 1, lineHeight: 20, paddingTop: spacing.xs }}>{bubbleText}</AppText>
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
            <Button
              label={t('showMe')}
              size="md"
              onPress={() => {
                setOpen(false);
                router.push(showMe);
              }}
              style={{ alignSelf: 'flex-start', paddingHorizontal: spacing.xxl, marginEnd: spacing.md }}
            />
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
          accessibilityState={{ expanded: open }}
          accessibilityActions={[{ name: 'longpress', label: t('hide') }]}
          onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && hide()}
          style={({ pressed }) => ({
            width: FAB,
            height: FAB,
            borderRadius: FAB / 2,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          })}
        >
          <Munti
            key={toast?.id ?? 'fab'}
            size="md"
            mood={toast ? toast.mood : open ? 'talk' : mood}
            settleAfter={toast || open ? 2400 : undefined}
          />
        </Pressable>
      )}
    </View>
  );
}
