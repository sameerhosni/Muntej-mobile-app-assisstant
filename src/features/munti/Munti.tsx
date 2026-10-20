// Munti — Muntej's round robot buddy. Pure SVG + React Native Animated (works in Expo Go and on web).
// Every moving part is its own full-size layer in the same 100×100 space, so each one turns/scales
// around its own point (transformOrigin) without any SVG prop animation.
// Hyper by default: hops in, bounces, and fidgets (hop, look around, wave, antenna flash, wiggle) every few seconds.
// Reduce motion on → static poses only (same face per mood, nothing moves).
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { colors, gradients } from '@/theme/tokens';

/** star = proud/on fire (star eyes + confetti), sad = behind (tear + sweat), oops = worried. */
export type MuntiMood = 'idle' | 'wave' | 'think' | 'talk' | 'celebrate' | 'oops' | 'sleep' | 'star' | 'sad';
export type MuntiSize = 'sm' | 'md' | 'lg';

export const MUNTI_SIZES: Record<MuntiSize, number> = { sm: 28, md: 56, lg: 120 };

const native = Platform.OS !== 'web';
const CONFETTI = [colors.gold, colors.mint, colors.purpleLight, colors.orange, colors.red, colors.cyan, colors.greenLight, colors.goldLight];
const FIDGET_MOODS: MuntiMood[] = ['idle', 'talk', 'star', 'wave', 'sad'];
const CONFETTI_MOODS: MuntiMood[] = ['celebrate', 'star'];

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
  /** Fidget every few seconds while idle/talking (default on). */
  hyper?: boolean;
  /** Screen-reader name; without it Munti is decorative and hidden from screen readers. */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function Munti({ mood: wanted = 'idle', size = 'md', settleAfter, hyper = true, label, style }: Props) {
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

  const v = useRef({
    enter: new Animated.Value(0), // 0..1 hop-in scale
    bob: new Animated.Value(0), // 0..1 body up/down
    jump: new Animated.Value(0), // 0..1 hop
    spin: new Animated.Value(0), // 0..1 full turn
    wiggle: new Animated.Value(0), // -1..1 small tilt
    shake: new Animated.Value(0), // -1..1 sideways
    look: new Animated.Value(0), // -1..1 eyes left/right
    blink: new Animated.Value(1), // eye scaleY
    mouth: new Animated.Value(1), // mouth scaleY
    light: new Animated.Value(0), // 0..1 antenna glow
    arm: new Animated.Value(0), // 0..1 end arm raised / swing
    burst: new Animated.Value(0), // 0..1 confetti out
    zzz: new Animated.Value(0), // 0..1 "z" floats up
    drop: new Animated.Value(0), // 0..1 tear/sweat slides down
  }).current;

  const t = (val: Animated.Value, toValue: number, duration: number, easing = Easing.inOut(Easing.quad)) =>
    Animated.timing(val, { toValue, duration, easing, useNativeDriver: native });

  // hop in once
  useEffect(() => {
    if (reduce) return v.enter.setValue(1);
    v.enter.setValue(0);
    Animated.spring(v.enter, { toValue: 1, friction: 4, tension: 120, useNativeDriver: native }).start();
  }, [reduce, v]);

  // the mood's own loop / one-shot
  useEffect(() => {
    const { bob, jump, spin, wiggle, shake, look, mouth, light, arm, burst, zzz, drop } = v;
    [bob, jump, spin, wiggle, shake, look, mouth, light, arm, burst, zzz, drop].forEach((x) => x.stopAnimation());
    bob.setValue(0);
    jump.setValue(0);
    spin.setValue(0);
    wiggle.setValue(0);
    shake.setValue(0);
    look.setValue(0);
    mouth.setValue(1);
    light.setValue(mood === 'think' ? 0.4 : 0);
    arm.setValue(0);
    burst.setValue(0);
    zzz.setValue(0);
    drop.setValue(0);
    if (reduce) return;

    const running: Animated.CompositeAnimation[] = [];
    const run = (a: Animated.CompositeAnimation) => {
      running.push(a);
      a.start();
    };

    const bobMs = mood === 'sleep' ? 2200 : mood === 'sad' ? 1600 : 650;
    if (mood !== 'oops') run(Animated.loop(Animated.sequence([t(bob, 1, bobMs), t(bob, 0, bobMs)])));

    if (mood === 'wave') run(Animated.loop(Animated.sequence([t(arm, 1, 220), t(arm, 0, 220)])));
    if (mood === 'think') run(Animated.loop(Animated.sequence([t(light, 1, 450), t(light, 0.3, 450)])));
    if (mood === 'talk') run(Animated.loop(Animated.sequence([t(mouth, 0.25, 130), t(mouth, 1, 150)])));
    if (mood === 'sleep') run(Animated.loop(Animated.sequence([t(zzz, 1, 2000, Easing.out(Easing.quad)), t(zzz, 0, 0)])));
    if (mood === 'sad') run(Animated.loop(Animated.sequence([t(drop, 1, 1400, Easing.in(Easing.quad)), t(drop, 0, 0), Animated.delay(500)])));
    if (mood === 'oops')
      run(
        Animated.loop(
          Animated.sequence([
            t(shake, 1, 50),
            t(shake, -1, 70),
            t(shake, 1, 70),
            t(shake, -1, 70),
            t(shake, 0, 50),
            Animated.delay(2200),
          ]),
        ),
      );
    if (CONFETTI_MOODS.includes(mood))
      run(
        Animated.parallel([
          Animated.sequence([t(jump, 1, 220, Easing.out(Easing.quad)), t(jump, 0, 260, Easing.bounce)]),
          t(spin, 1, 480),
          t(burst, 1, 900, Easing.out(Easing.cubic)),
          Animated.loop(Animated.sequence([t(light, 1, 150), t(light, 0, 150)]), { iterations: 4 }),
        ]),
      );

    return () => running.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, reduce, v]);

  // fidgets: one random move every 2-4 s
  const fidgets = hyper && !reduce && FIDGET_MOODS.includes(mood);
  useEffect(() => {
    if (!fidgets) return;
    const { jump, look, arm, light, wiggle } = v;
    let timer: ReturnType<typeof setTimeout>;
    let current: Animated.CompositeAnimation | undefined;
    const lookAround = () => Animated.sequence([t(look, -1, 180), Animated.delay(380), t(look, 1, 260), Animated.delay(300), t(look, 0, 180)]);
    const flash = () => Animated.sequence([t(light, 1, 120), t(light, 0, 120), t(light, 1, 120), t(light, 0, 160)]);
    // sad = slow, small moves only (looks around, antenna blinks); the others get the whole set
    const moves: (() => Animated.CompositeAnimation)[] =
      mood === 'sad'
        ? [lookAround, flash]
        : [
            () => Animated.sequence([t(jump, 0.45, 200, Easing.out(Easing.quad)), t(jump, 0, 260, Easing.bounce)]),
            lookAround,
            flash,
            () => Animated.sequence([t(wiggle, 1, 110), t(wiggle, -1, 160), t(wiggle, 1, 160), t(wiggle, 0, 110)]),
          ];
    if (mood !== 'wave' && mood !== 'sad')
      moves.push(() => Animated.sequence([t(arm, 1, 180), t(arm, 0.7, 150), t(arm, 1, 150), t(arm, 0.7, 150), t(arm, 1, 150), t(arm, 0, 200)]));
    const next = () => {
      timer = setTimeout(() => {
        current = moves[Math.floor(Math.random() * moves.length)]();
        current.start(next);
      }, 2000 + Math.random() * 2000);
    };
    next();
    return () => {
      clearTimeout(timer);
      current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fidgets, mood, v]);

  // blink every few seconds (not while asleep or with happy/star eyes)
  const blinks = !reduce && !['sleep', 'celebrate', 'star'].includes(mood);
  useEffect(() => {
    v.blink.setValue(1);
    if (!blinks) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        Animated.sequence([t(v.blink, 0.1, 70), t(v.blink, 1, 90)]).start(next);
      }, 2200 + Math.random() * 2400);
    };
    next();
    return () => {
      clearTimeout(timer);
      v.blink.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blinks, v]);

  const layer = { position: 'absolute' as const, left: 0, top: 0, width: S, height: S };
  const bodyMove = {
    transform: [
      { scale: v.enter.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
      { translateY: v.bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5 * u] }) },
      { translateY: v.jump.interpolate({ inputRange: [0, 1], outputRange: [0, -22 * u] }) },
      { translateX: v.shake.interpolate({ inputRange: [-1, 1], outputRange: [-5 * u, 5 * u] }) },
      { rotate: v.spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
      { rotate: v.wiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-12deg', '12deg'] }) },
    ],
  };

  // arms hang from the shoulders; celebrate/star = both up, wave = end arm up and swinging, sad = droopy
  const up = CONFETTI_MOODS.includes(mood);
  const leftArmDeg = up ? 150 : mood === 'oops' ? 35 : mood === 'sad' ? 4 : 14;
  const rightRest = up ? -150 : mood === 'oops' ? -35 : mood === 'sad' ? -4 : -14;
  const rightArm = v.arm.interpolate({
    inputRange: [0, 1],
    outputRange: mood === 'wave' ? ['-125deg', '-165deg'] : [`${rightRest}deg`, '-145deg'],
  });

  const lightColor =
    mood === 'oops' || mood === 'sad'
      ? colors.red
      : mood === 'think'
        ? colors.mint
        : mood === 'sleep'
          ? colors.textFaint
          : mood === 'star'
            ? colors.goldLight
            : colors.gold;

  return (
    <View
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      pointerEvents="none"
      style={[{ width: S, height: S }, style]}
    >
      <Animated.View style={[layer, { transformOrigin: '50% 90%' }, bodyMove]}>
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
          {(mood === 'oops' || mood === 'celebrate' || mood === 'star') && (
            <>
              <Circle cx={28} cy={68} r={4} fill={colors.red} opacity={0.35} />
              <Circle cx={72} cy={68} r={4} fill={colors.red} opacity={0.35} />
            </>
          )}
        </Svg>

        {/* eyes (blink = squash around the eye line, look = slide sideways) */}
        <Animated.View
          style={[
            layer,
            {
              transformOrigin: '50% 55%',
              transform: [{ translateX: v.look.interpolate({ inputRange: [-1, 1], outputRange: [-4 * u, 4 * u] }) }, { scaleY: v.blink }],
            },
          ]}
        >
          <Eyes mood={mood} S={S} />
        </Animated.View>

        {/* mouth (talk = open/close) */}
        <Animated.View style={[layer, { transformOrigin: '50% 69%', transform: [{ scaleY: v.mouth }] }]}>
          <Mouth mood={mood} S={S} />
        </Animated.View>

        {/* sad: tear under the eye + sweat drop on the forehead, both sliding down */}
        {mood === 'sad' && (
          <Animated.View
            style={[
              layer,
              {
                opacity: v.drop.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                transform: [{ translateY: v.drop.interpolate({ inputRange: [0, 1], outputRange: [0, 10 * u] }) }],
              },
            ]}
          >
            <Svg width={S} height={S} viewBox="0 0 100 100">
              <Path d="M33 62 Q30 68 33 70 Q36 68 33 62 Z" fill={colors.cyan} stroke={colors.onDark} strokeWidth={0.8} />
              <Path d="M76 34 Q72 41 76 44 Q80 41 76 34 Z" fill={colors.onDark} opacity={0.9} />
            </Svg>
          </Animated.View>
        )}

        {/* antenna light: glow + bulb */}
        <Animated.View
          style={[
            layer,
            {
              transformOrigin: '50% 11%',
              opacity: v.light.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
              transform: [{ scale: v.light.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] }) }],
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
              opacity: v.zzz.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateY: v.zzz.interpolate({ inputRange: [0, 1], outputRange: [0, -14 * u] }) },
                { translateX: v.zzz.interpolate({ inputRange: [0, 1], outputRange: [0, 6 * u] }) },
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

      {CONFETTI_MOODS.includes(mood) &&
        !reduce &&
        CONFETTI.map((c, i) => {
          const a = (i / CONFETTI.length) * Math.PI * 2 - Math.PI / 2;
          const d = 46 + (i % 3) * 8;
          return (
            <Animated.View
              key={i}
              style={[
                layer,
                {
                  opacity: v.burst.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                  transform: [
                    { translateX: v.burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * d * u] }) },
                    { translateY: v.burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * d * u] }) },
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

/** 5-point star path centred on (cx, cy). */
function starPath(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    pts.push(`${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

function Eyes({ mood, S }: { mood: MuntiMood; S: number }) {
  const eyes = [38, 62];
  if (mood === 'star') {
    return (
      <Svg width={S} height={S} viewBox="0 0 100 100">
        {eyes.map((x) => (
          <Path key={x} d={starPath(x, 55, 10)} fill={colors.goldLight} stroke={colors.onDark} strokeWidth={1.5} strokeLinejoin="round" />
        ))}
      </Svg>
    );
  }
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
  const [px, py, pr] = mood === 'think' ? [2, -4, 4.2] : mood === 'oops' ? [0, 1, 3] : mood === 'sad' ? [0, 3, 4] : [0, 1, 4.5];
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
          {/* worried: inner ends raised (inner ends down would read as angry) */}
          <Path d="M30 44 Q37 42 44 39" stroke={colors.navy} strokeWidth={3} strokeLinecap="round" fill="none" />
          <Path d="M70 44 Q63 42 56 39" stroke={colors.navy} strokeWidth={3} strokeLinecap="round" fill="none" />
        </>
      )}
      {mood === 'sad' && (
        <>
          {/* inner ends up = sad */}
          <Path d="M30 46 L44 41" stroke={colors.navy} strokeWidth={3} strokeLinecap="round" />
          <Path d="M70 46 L56 41" stroke={colors.navy} strokeWidth={3} strokeLinecap="round" />
          {/* droopy lids */}
          <Path d="M29 52 Q38 47 47 52" stroke={colors.primaryDark} strokeWidth={3} fill={colors.primaryDark} />
          <Path d="M53 52 Q62 47 71 52" stroke={colors.primaryDark} strokeWidth={3} fill={colors.primaryDark} />
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
    case 'star':
      shape = <Path d="M40 65 Q50 80 60 65 Z" fill={colors.navy} stroke={colors.navy} strokeWidth={2} strokeLinejoin="round" />;
      break;
    case 'oops':
      shape = <Path d="M42 71 Q46 67 50 71 Q54 75 58 71" stroke={colors.navy} strokeWidth={2.6} strokeLinecap="round" fill="none" />;
      break;
    case 'sad':
      shape = <Path d="M42 73 Q50 65 58 73" stroke={colors.navy} strokeWidth={2.8} strokeLinecap="round" fill="none" />;
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
