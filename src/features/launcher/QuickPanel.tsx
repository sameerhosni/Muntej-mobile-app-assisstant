// Your shortcuts as a side panel on Home, like Android's edge panel (owner, 20 Nov: "the side bar one to be closed and
// opened easily"). A small tab on the start edge, at mid-height (away from Saree3, who sits at the bottom end): one tap
// opens the panel, the same tab (now on the panel's edge) closes it, and so do a tap outside, Android Back, or picking a
// place. A tap, never a swipe: the edges belong to Android's Back gesture. Reduce motion on → no slide.
import { useCallback, useEffect, useRef } from 'react';
import { Animated, BackHandler, Easing, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react-native';
import { AppText, IconBadge } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useReduceMotion } from '@/features/munti/Munti';
import { useMunti } from '@/features/munti/store';
import { TourTarget } from '@/features/walkthrough/TourTarget';
import { featureUsed } from '@/features/launch/launch';
import { shortcutsOpen, useShortcuts, useShortcutsOpen, type ShortcutItem } from './shortcuts';
import { LAUNCHER_NS } from './strings';

const W = 104;

/** one place in the panel (or Saree3's speed dial): its icon and name, one tap opens it */
export function ShortcutTile({ item, onDark = true }: { item: ShortcutItem; onDark?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        shortcutsOpen.set(false);
        featureUsed('shortcuts');
        router.push(item.href);
      }}
      accessibilityRole="link"
      accessibilityLabel={item.label}
      style={({ pressed }) => ({ minHeight: 68, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.75 : 1 })}
    >
      <View style={{ width: 48, height: 48, borderRadius: radius.tile, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <IconBadge size={36} bg={item.bg} round>
          <item.Icon color={item.fg} size={19} strokeWidth={2.2} />
        </IconBadge>
      </View>
      <AppText variant="micro" weight="bold" align="center" numberOfLines={2} color={onDark ? 'onDark' : 'textSoft'}>
        {item.label}
      </AppText>
    </Pressable>
  );
}

export function QuickPanel() {
  const { t } = useScreenT(LAUNCHER_NS);
  const { isRTL } = useDirection();
  const sc = useShortcuts();
  const open = useShortcutsOpen();
  const reduce = useReduceMotion();
  const ms = useMunti();
  const { height: screenH } = useWindowDimensions();
  // 0 = closed (only the tab shows), 1 = open
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return v.setValue(open ? 1 : 0);
    Animated.timing(v, { toValue: open ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [open, reduce, v]);
  // Back closes it first
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => (shortcutsOpen.set(false), true));
    return () => sub.remove();
  }, [open]);
  // leaving Home closes it
  useFocusEffect(useCallback(() => () => shortcutsOpen.set(false), []));

  // "From Saree3" needs Saree3 on screen: while he's off or hidden, the side tab stands in (reviewer, 20 Nov)
  const saree3Away = !ms.enabled || ms.hidden;
  if (!sc.ready || (sc.style !== 'panel' && !saree3Away)) return null;
  // the screen edge Arabic readers start from (right), English ones the left. Laid out in a left-to-right box with fixed
  // left/right, so it is the same on every phone and on the web; closed, the panel waits off that edge and only its tab
  // shows (QA, 20 Nov: a start-based layout slid the wrong way on the web)
  const right = isRTL;
  const hidden = (right ? 1 : -1) * W;
  const Toward = right ? (open ? ChevronRight : ChevronLeft) : open ? ChevronLeft : ChevronRight;
  // rounded on the side toward the middle of the screen
  const inner = (r: number) => (right ? { borderTopLeftRadius: r, borderBottomLeftRadius: r } : { borderTopRightRadius: r, borderBottomRightRadius: r });

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, direction: 'ltr' }}>
      {open && (
        <Pressable
          onPress={() => shortcutsOpen.set(false)}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.scrim }}
        />
      )}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, ...(right ? { right: 0 } : { left: 0 }), justifyContent: 'center' }}>
        <Animated.View
          style={{
            flexDirection: right ? 'row-reverse' : 'row',
            alignItems: 'center',
            transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [hidden, 0] }) }],
          }}
        >
          <View
            accessibilityElementsHidden={!open}
            importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
            aria-hidden={!open}
            style={{
              width: W,
              // fits short phones too (it scrolls past that)
              maxHeight: Math.min(620, screenH * 0.75),
              paddingVertical: spacing.md,
              ...inner(radius.cardLg),
              direction: right ? 'rtl' : 'ltr',
              backgroundColor: colors.panel,
              boxShadow: shadows.raised,
            }}
          >
            <ScrollView contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.sm }} showsVerticalScrollIndicator={false}>
              {sc.items.map((it) => (
                <ShortcutTile key={it.key} item={it} />
              ))}
              <ShortcutTile item={sc.more} />
              <View style={{ height: 1, backgroundColor: colors.glassBorder, marginVertical: spacing.xs }} />
              <Pressable
                onPress={() => {
                  shortcutsOpen.set(false);
                  router.push('/64-shortcuts' as Href);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('editRow')}
                style={({ pressed }) => ({ minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.75 : 1 })}
              >
                <Pencil color={colors.onDark} size={15} />
                <AppText variant="caption" weight="bold" color="onDark">
                  {t('edit')}
                </AppText>
              </Pressable>
            </ScrollView>
          </View>
          {/* the tab: opens and closes it (44 px to tap; looks slimmer) */}
          <TourTarget id="home.panel">
            <Pressable
              onPress={() => shortcutsOpen.toggle()}
              accessibilityRole="button"
              accessibilityLabel={open ? t('close') : t('open')}
              accessibilityHint={open ? undefined : t('openHint')}
              accessibilityState={{ expanded: open }}
              hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
              style={({ pressed }) => ({
                width: 26,
                height: 84,
                ...inner(14),
                backgroundColor: open ? colors.panel : colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: shadows.primary,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Toward color={colors.onDark} size={18} strokeWidth={2.6} />
            </Pressable>
          </TourTarget>
        </Animated.View>
      </View>
    </View>
  );
}
