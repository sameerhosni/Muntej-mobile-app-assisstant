// Munti — Muntej's round robot buddy. Pure SVG + React Native Animated (works in Expo Go and on web).
// Every moving part is its own full-size layer in the same 100×100 space, so each one turns/scales
// around its own point (transformOrigin) without any SVG prop animation.
// Reduce motion on → static poses only (same face per mood, nothing moves).
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { colors, gradients } from '@/theme/tokens';

export type MuntiMood = 'idle' | 'wave' | 'think' | 'talk' | 'celebrate' | 'oops' | 'sleep';
export type MuntiSize = 'sm' | 'md' | 'lg';

export const MUNTI_SIZES: Record<MuntiSize, number> = { sm: 28, md: 56, lg: 120 };

const native = Platform.OS !== 'web';
const CONFETTI = [colors.gold, colors.mint, colors.purpleLight, colors.orange, colors.red, colors.cyan, colors.greenLight, colors.goldLight];

/** True while the OS "reduce motion" setting is on. */
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

type Props = {
  mood?: MuntiMood;
  size?: MuntiSize;
  /** Go back to idle after this many ms (e.g. talk only while a new reply arrives). */
  settleAfter?: number;
  /** Screen-reader name; without it Munti is decorative and hidden from screen readers. */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function Munti({ mood: wanted = 'idle', size = 'md', settleAfter, label, style }: Props) {
  const S = MUNTI_SIZES[size];
  const u = S / 100;
  const reduce = useReduceMotion();

  const [mood, setMood] = useState<MuntiMood>(wanted);
  useEffect(() => {
    setMood(wanted);
    if (!settleAfter || wanted === 'idle') return;
    const id = setTimeout(() => setMood('idle'), settleAfter);
    return () => clearTimeout(id);
  }, [wanted, settleAfter]);

  const bob = useRef(new Animated.Value(0)).current; // 0..1 → body up/down
  const jump = useRef(new Animated.Value(0)).current; // 0..1 → celebrate hop
  const spin = useRef(new Animated.Value(0)).current; // 0..1 → full turn
  const shake = useRef(new Animated.Value(0)).current; // -1..1 → sideways
  const blink = useRef(new Animated.Value(1)).current; // eye scaleY
  const mouth = useRef(new Animated.Value(1)).current; // mouth scaleY
  const light = useRef(new Animated.Value(0)).current; // 0..1 antenna glow
  const arm = useRef(new Animated.Value(0)).current; // 0..1 wave swing
  const burst = useRef(new Animated.Value(0)).current; // 0..1 confetti out
  const zzz = useRef(new Animated.Value(0)).current; // 0..1 "z" floats up

  useEffect(() => {
    const all = [bob, jump, spin, shake, mouth, light, arm, burst, zzz];
    all.forEach((v) => v.stopAnimation());
    bob.setValue(0);
    jump.setValue(0);
    spin.setValue(0);
    shake.setValue(0);
    mouth.setValue(1);
    light.setValue(mood === 'think' ? 0.4 : 0);
    arm.setValue(0);
    burst.setValue(0);
    zzz.setValue(0);
    if (reduce) return;

    const t = (v: Animated.Value, toValue: number, duration: number, easing = Easing.inOut(Easing.quad)) =>
      Animated.timing(v, { toValue, duration, easing, useNativeDriver: native });
    const running: Animated.CompositeAnimation[] = [];
    const run = (a: Animated.CompositeAnimation) => {
      running.push(a);
      a.start();
    };

    const bobMs = mood === 'sleep' ? 2200 : 1400;
    if (mood !== 'oops') run(Animated.loop(Animated.sequence([t(bob, 1, bobMs), t(bob, 0, bobMs)])));

    if (mood === 'wave') run(Animated.loop(Animated.sequence([t(arm, 1, 260), t(arm, 0, 260)])));
    if (mood === 'think') run(Animated.loop(Animated.sequence([t(light, 1, 500), t(light, 0.3, 500)])));
    if (mood === 'talk') run(Animated.loop(Animated.sequence([t(mouth, 0.25, 140), t(mouth, 1, 160)])));
    if (mood === 'sleep') run(Animated.loop(Animated.sequence([t(zzz, 1, 2000, Easing.out(Easing.quad)), t(zzz, 0, 0)])));
    if (mood === 'oops')
      run(
        Animated.sequence([
          t(shake, 1, 50),
          t(shake, -1, 70),
          t(shake, 1, 70),
          t(shake, -1, 70),
          t(shake, 0, 50),
        ]),
      );
    if (mood === 'celebrate')
      run(
        Animated.parallel([
          Animated.sequence([t(jump, 1, 220, Easing.out(Easing.quad)), t(jump, 0, 260, Easing.bounce)]),
          t(spin, 1, 480),
          t(burst, 1, 900, Easing.out(Easing.cubic)),
          Animated.loop(Animated.sequence([t(light, 1, 150), t(light, 0, 150)]), { iterations: 4 }),
        ]),
      );

    return () => running.forEach((a) => a.stop());
  }, [mood, reduce, bob, jump, spin, shake, mouth, light, arm, burst, zzz]);

  // blink every few seconds (not while asleep or showing happy/closed eyes)
  const blinks = !reduce && mood !== 'sleep' && mood !== 'celebrate';
  useEffect(() => {
    blink.setValue(1);
    if (!blinks) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        Animated.sequence([
          Animated.timing(blink, { toValue: 0.1, duration: 70, useNativeDriver: native }),
          Animated.timing(blink, { toValue: 1, duration: 90, useNativeDriver: native }),
        ]).start(next);
      }, 2600 + Math.random() * 2400);
    };
    next();
    return () => {
      clearTimeout(timer);
      blink.stopAnimation();
    };
  }, [blinks, blink]);

  const layer = { position: 'absolute' as const, left: 0, top: 0, width: S, height: S };
  const bodyMove = {
    transform: [
      { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3 * u] }) },
      { translateY: jump.interpolate({ inputRange: [0, 1], outputRange: [0, -22 * u] }) },
      { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-5 * u, 5 * u] }) },
      { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
    ],
  };

  // arms hang from the shoulders; celebrate = both up, wave = end arm up and swinging
  const leftArmDeg = mood === 'celebrate' ? 150 : mood === 'oops' ? 35 : 14;
  const rightArm =
    mood === 'wave'
      ? arm.interpolate({ inputRange: [0, 1], outputRange: ['-125deg', '-165deg'] })
      : mood === 'celebrate'
        ? '-150deg'
        : mood === 'oops'
          ? '-35deg'
          : '-14deg';

  const lightColor = mood === 'oops' ? colors.red : mood === 'think' ? colors.mint : mood === 'sleep' ? colors.textFaint : colors.gold;

  return (
    <View
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      pointerEvents="none"
      style={[{ width: S, height: S }, style]}
    >
      <Animated.View style={[layer, bodyMove]}>
        {/* arms (behind the body) */}
        <Animated.View style={[layer, { transformOrigin: '17% 58%', transform: [{ rotate: `${leftArmDeg}deg` }] }]}>
          <Arm x={17} />
        </Animated.View>
        <Animated.View style={[layer, { transformOrigin: '83% 58%', transform: [{ rotate: rightArm }] }]}>
          <Arm x={83} />
        </Animated.View>

        {/* body, face plate, antenna stick */}
        <Svg width={S} height={S} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id="muntiBody" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={gradients.avatarBlue[0]} />
              <Stop offset="1" stopColor={gradients.avatarBlue[1]} />
            </LinearGradient>
          </Defs>
          <Rect x={48.5} y={14} width={3} height={14} rx={1.5} fill={colors.navy} />
          <Circle cx={50} cy={60} r={34} fill="url(#muntiBody)" />
          <Ellipse cx={50} cy={58} rx={25} ry={19} fill={colors.navy} opacity={0.22} />
          <Ellipse cx={39} cy={36} rx={9} ry={5} fill={colors.onDark} opacity={0.28} />
          {(mood === 'oops' || mood === 'celebrate') && (
            <>
              <Circle cx={28} cy={68} r={4} fill={colors.red} opacity={0.35} />
              <Circle cx={72} cy={68} r={4} fill={colors.red} opacity={0.35} />
            </>
          )}
        </Svg>

        {/* eyes (blink = squash around the eye line) */}
        <Animated.View style={[layer, { transformOrigin: '50% 55%', transform: [{ scaleY: blink }] }]}>
          <Eyes mood={mood} S={S} />
        </Animated.View>

        {/* mouth (talk = open/close) */}
        <Animated.View style={[layer, { transformOrigin: '50% 69%', transform: [{ scaleY: mouth }] }]}>
          <Mouth mood={mood} S={S} />
        </Animated.View>

        {/* antenna light: glow + bulb */}
        <Animated.View
          style={[
            layer,
            {
              transformOrigin: '50% 11%',
              opacity: light.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
              transform: [{ scale: light.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.4] }) }],
            },
          ]}
        >
          <Svg width={S} height={S} viewBox="0 0 100 100">
            <Circle cx={50} cy={11} r={9} fill={lightColor} />
          </Svg>
        </Animated.View>
        <Svg width={S} height={S} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
          <Circle cx={50} cy={11} r={5.5} fill={lightColor} stroke={colors.navy} strokeWidth={1.5} />
        </Svg>
      </Animated.View>

      {mood === 'sleep' && (
        <Animated.View
          style={[
            layer,
            {
              opacity: zzz.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateY: zzz.interpolate({ inputRange: [0, 1], outputRange: [0, -14 * u] }) },
                { translateX: zzz.interpolate({ inputRange: [0, 1], outputRange: [0, 6 * u] }) },
              ],
            },
          ]}
        >
          <Svg width={S} height={S} viewBox="0 0 100 100">
            <SvgText x={76} y={30} fontSize={22} fontWeight="bold" fill={colors.primary}>
              z
            </SvgText>
            <SvgText x={88} y={16} fontSize={14} fontWeight="bold" fill={colors.primaryLight}>
              z
            </SvgText>
          </Svg>
        </Animated.View>
      )}

      {mood === 'celebrate' &&
        CONFETTI.map((c, i) => {
          const a = (i / CONFETTI.length) * Math.PI * 2 - Math.PI / 2;
          const d = 46 + (i % 3) * 8;
          return (
            <Animated.View
              key={i}
              style={[
                layer,
                {
                  opacity: reduce ? 0 : burst.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                  transform: [
                    { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * d * u] }) },
                    { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * d * u] }) },
                  ],
                },
              ]}
            >
              <Svg width={S} height={S} viewBox="0 0 100 100">
                {i % 2 ? (
                  <Circle cx={50} cy={45} r={4} fill={c} />
                ) : (
                  <Rect x={47} y={42} width={6} height={6} rx={1.5} fill={c} transform="rotate(30 50 45)" />
                )}
              </Svg>
            </Animated.View>
          );
        })}
    </View>
  );
}

function Arm({ x }: { x: number }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100">
      <Rect x={x - 5} y={55} width={10} height={24} rx={5} fill={colors.primaryDark} />
      <Circle cx={x} cy={80} r={6} fill={colors.cyan} stroke={colors.primaryDark} strokeWidth={2} />
    </Svg>
  );
}

function Eyes({ mood, S }: { mood: MuntiMood; S: number }) {
  const eyes = [38, 62];
  if (mood === 'sleep' || mood === 'celebrate') {
    // sleep = closed (curved down), celebrate = happy (^ ^)
    const d = mood === 'sleep' ? (x: number) => `M${x - 7} 54 Q${x} 60 ${x + 7} 54` : (x: number) => `M${x - 7} 57 Q${x} 48 ${x + 7} 57`;
    return (
      <Svg width={S} height={S} viewBox="0 0 100 100">
        {eyes.map((x) => (
          <Path key={x} d={d(x)} stroke={colors.onDark} strokeWidth={3.5} strokeLinecap="round" fill="none" />
        ))}
      </Svg>
    );
  }
  const [px, py, pr] = mood === 'think' ? [2, -4, 4.2] : mood === 'oops' ? [0, 1, 3] : [0, 1, 4.5];
  return (
    <Svg width={S} height={S} viewBox="0 0 100 100">
      {eyes.map((x) => (
        <Circle key={x} cx={x} cy={55} r={9} fill={colors.onDark} />
      ))}
      {eyes.map((x) => (
        <Circle key={`p${x}`} cx={x + px} cy={55 + py} r={pr} fill={colors.navy} />
      ))}
      {eyes.map((x) => (
        <Circle key={`s${x}`} cx={x + px + 1.6} cy={55 + py - 1.8} r={1.3} fill={colors.onDark} />
      ))}
      {mood === 'oops' && (
        <>
          <Path d="M30 42 L44 46" stroke={colors.navy} strokeWidth={3} strokeLinecap="round" />
          <Path d="M70 42 L56 46" stroke={colors.navy} strokeWidth={3} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}

function Mouth({ mood, S }: { mood: MuntiMood; S: number }) {
  let shape;
  switch (mood) {
    case 'talk':
      shape = <Ellipse cx={50} cy={69} rx={6} ry={4.5} fill={colors.navy} />;
      break;
    case 'celebrate':
      shape = <Path d="M41 66 Q50 78 59 66 Z" fill={colors.navy} stroke={colors.navy} strokeWidth={2} strokeLinejoin="round" />;
      break;
    case 'oops':
      shape = <Path d="M42 71 Q46 67 50 71 Q54 75 58 71" stroke={colors.navy} strokeWidth={2.6} strokeLinecap="round" fill="none" />;
      break;
    case 'sleep':
      shape = <Ellipse cx={50} cy={70} rx={3} ry={2.2} fill={colors.navy} />;
      break;
    case 'think':
      shape = <Path d="M45 70 L56 68" stroke={colors.navy} strokeWidth={2.6} strokeLinecap="round" />;
      break;
    default:
      shape = <Path d="M43 67 Q50 74 57 67" stroke={colors.navy} strokeWidth={2.8} strokeLinecap="round" fill="none" />;
  }
  return (
    <Svg width={S} height={S} viewBox="0 0 100 100">
      {shape}
    </Svg>
  );
}
