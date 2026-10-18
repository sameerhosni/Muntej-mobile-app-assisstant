import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Mic, Square } from 'lucide-react-native';
import { Gradient } from '@/components/ui';
import { colors, shadows } from '@/theme/tokens';

type Props = { onPress: () => void; label: string; active?: boolean; size?: number };

/** Big gradient mic with two soft rings. Rings pulse and the icon becomes "stop" while `active`. */
export function MicButton({ onPress, label, active = false, size = 150 }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const inner = size * 0.787;
  const core = size * 0.587;
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.primaryTint,
          transform: [{ scale: ringScale }],
          opacity: ringOpacity,
        }}
      />
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: shadows.card,
        }}
      >
        <View style={{ width: core, height: core, borderRadius: core / 2, overflow: 'hidden', boxShadow: shadows.mic }}>
          <Gradient name={active ? 'warning' : 'heroManager'} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {active ? (
              <Square color={colors.onDark} fill={colors.onDark} size={core * 0.3} strokeWidth={2} />
            ) : (
              <Mic color={colors.onDark} size={core * 0.39} strokeWidth={2} />
            )}
          </Gradient>
        </View>
      </View>
    </Pressable>
  );
}
