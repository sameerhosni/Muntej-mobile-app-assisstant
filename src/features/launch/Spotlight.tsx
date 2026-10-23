// Wrap the thing a new feature is about: when "Show me" lands here, it pulses with a ring and a "Here it is" tag.
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { spotlight, useSpotlight } from './launch';
import { walkthrough } from '@/features/walkthrough/store';
import { LAUNCH_NS } from './strings';

const native = Platform.OS !== 'web';

export function Spotlight({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { t } = useScreenT(LAUNCH_NS);
  const on = useSpotlight() === id;
  const pulse = useRef(new Animated.Value(0)).current;
  // glow for 8 s from when it's actually on screen (the screen may have loaded slowly)
  useEffect(() => {
    if (!on) return;
    const id = setTimeout(() => spotlight.clear(), 8000);
    return () => clearTimeout(id);
  }, [on]);
  useEffect(() => {
    if (!on) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: native }),
        Animated.timing(pulse, { toValue: 0, duration: 650, useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, pulse]);

  return (
    // also a walkthrough target: "Show me" on a "New for you" card lights this up with Saree3's walkthrough
    <View ref={(v) => walkthrough.setTarget(id, v)} collapsable={false} style={style} onTouchStart={on ? () => spotlight.clear() : undefined}>
      {children}
      {on && (
        <>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: -6,
              right: -6,
              top: -6,
              bottom: -6,
              borderRadius: radius.card + 6,
              borderWidth: 3,
              borderColor: colors.primary,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }],
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -14,
              alignSelf: 'center',
              paddingHorizontal: spacing.md,
              paddingVertical: 3,
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
            }}
          >
            <AppText variant="caption" weight="bold" color="onDark">
              {t('tapHere')}
            </AppText>
          </View>
        </>
      )}
    </View>
  );
}
