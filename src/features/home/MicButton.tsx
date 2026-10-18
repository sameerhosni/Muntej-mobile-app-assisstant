import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Mic } from 'lucide-react-native';
import { colors } from '@/theme/tokens';

type Props = { onPress: () => void; label: string; active?: boolean; size?: number };

/** Big teal mic with two rings (Home + Capture). Rings pulse while `active`. */
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
          borderWidth: 1,
          borderColor: colors.ringOuter,
          transform: [{ scale: ringScale }],
          opacity: ringOpacity,
        }}
      />
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          borderWidth: 1,
          borderColor: colors.ringInner,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: core,
            height: core,
            borderRadius: core / 2,
            backgroundColor: active ? colors.red : colors.teal,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Mic color={colors.onTeal} size={core * 0.39} strokeWidth={2} />
        </View>
      </View>
    </Pressable>
  );
}
