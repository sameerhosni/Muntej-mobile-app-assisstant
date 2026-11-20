// Munti — Saree3's look: the Muntej mark (owner, 19 Nov 2026, option 2: "more formal to fit big clients"). A blue orb
// with a white spark and no face, inside a ring. Pure SVG + React Native Animated (works in Expo Go and on web).
// `tone` is the status: the ring takes its colour AND a small sign sits on the ring (★ great, ✓ good, ! watch out,
// ↓ behind, ≡ overloaded, – quiet), so status never rests on colour alone. brand = no status (chat, tour…).
// Calm motion only: a slow breathing while he talks or thinks, one short glow to celebrate, dimmed while asleep.
// No hops, fidgets, arms or confetti. Reduce motion on → he doesn't move at all.
// The props stay as they were (mood, size, tone, settleAfter, hyper, label, style), so all ~30 places switch at once.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, gradients } from '@/theme/tokens';

export type MuntiMood = 'idle' | 'wave' | 'think' | 'talk' | 'celebrate' | 'oops' | 'sleep' | 'star' | 'sad' | 'dizzy';
export type MuntiTone = 'brand' | 'gold' | 'green' | 'amber' | 'red' | 'purple' | 'grey';
export type MuntiSize = 'sm' | 'md' | 'lg';

export const MUNTI_SIZES: Record<MuntiSize, number> = { sm: 28, md: 56, lg: 120 };

/** ring colour per status (theme tokens); brand = the mark's own light blue */
const RING: Record<MuntiTone, string> = {
  brand: colors.primaryLight,
  gold: gradients.points[0],
  green: gradients.success[0],
  amber: gradients.warning[0],
  red: colors.red,
  purple: gradients.avatarPurple[0],
  grey: colors.textFaint,
};

const native = Platform.OS !== 'web';
const BREATHE: MuntiMood[] = ['talk', 'think', 'wave'];
const GLOW: MuntiMood[] = ['celebrate', 'star'];

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
  /** kept for the callers; the mark is always calm now */
  hyper?: boolean;
  /** Screen-reader name; without it the mark is decorative and hidden from screen readers. */
  label?: string;
  /** status (ring colour + sign); default brand = no status */
  tone?: MuntiTone;
  style?: StyleProp<ViewStyle>;
};

export function Munti({ mood: wanted = 'idle', size = 'md', settleAfter, label, tone = 'brand', style }: Props) {
  const S = MUNTI_SIZES[size];
  const reduce = useReduceMotion();
  const ring = RING[tone];

  const [mood, setMood] = useState<MuntiMood>(wanted);
  useEffect(() => {
    setMood(wanted);
    if (!settleAfter || wanted === 'idle') return;
    const id = setTimeout(() => setMood('idle'), settleAfter);
    return () => clearTimeout(id);
  }, [wanted, settleAfter]);

  const v = useRef({
    enter: new Animated.Value(0), // 0..1 fade in once
    breathe: new Animated.Value(0), // 0..1 slow scale while talking/thinking
    glow: new Animated.Value(0), // 0..1 one halo out to celebrate
  }).current;

  const t = (val: Animated.Value, toValue: number, duration: number, easing = Easing.inOut(Easing.quad)) =>
    Animated.timing(val, { toValue, duration, easing, useNativeDriver: native });

  useEffect(() => {
    if (reduce) return v.enter.setValue(1);
    v.enter.setValue(0);
    t(v.enter, 1, 260, Easing.out(Easing.quad)).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, v]);

  useEffect(() => {
    v.breathe.stopAnimation();
    v.glow.stopAnimation();
    v.breathe.setValue(0);
    v.glow.setValue(0);
    if (reduce) return;
    const running: Animated.CompositeAnimation[] = [];
    if (BREATHE.includes(mood)) running.push(Animated.loop(Animated.sequence([t(v.breathe, 1, 1200), t(v.breathe, 0, 1200)])));
    if (GLOW.includes(mood)) running.push(t(v.glow, 1, 900, Easing.out(Easing.cubic)));
    running.forEach((a) => a.start());
    return () => running.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, reduce, v]);

  const layer = { position: 'absolute' as const, left: 0, top: 0, width: S, height: S };
  const id = `muntiOrb-${tone}`;

  return (
    <View
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      pointerEvents="none"
      style={[{ width: S, height: S }, style]}
    >
      {/* celebrate: one soft halo in the ring colour, then gone */}
      {GLOW.includes(mood) && !reduce && (
        <Animated.View
          style={[
            layer,
            {
              opacity: v.glow.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.45, 0] }),
              transform: [{ scale: v.glow.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.3] }) }],
            },
          ]}
        >
          <Svg width={S} height={S} viewBox="0 0 100 100">
            <Circle cx={50} cy={50} r={44} fill={ring} />
          </Svg>
        </Animated.View>
      )}

      <Animated.View
        style={[
          layer,
          {
            opacity: Animated.multiply(v.enter, mood === 'sleep' ? 0.55 : 1),
            transform: [
              { scale: v.enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              { scale: v.breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
            ],
          },
        ]}
      >
        <Svg width={S} height={S} viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={gradients.primary[0]} />
              <Stop offset="1" stopColor={colors.navy} />
            </LinearGradient>
          </Defs>
          {/* the ring: status colour (thicker when there is a status, so it reads at 28 px) */}
          <Circle cx={50} cy={50} r={42} fill="none" stroke={ring} strokeWidth={tone === 'brand' ? 5 : 8} opacity={tone === 'brand' ? 0.45 : 1} />
          {/* the orb and the Muntej spark */}
          <Circle cx={50} cy={50} r={33} fill={`url(#${id})`} />
          <Path d={spark(50, 50, 19)} fill={colors.onDark} />
          {tone !== 'brand' && <Sign tone={tone} color={ring} />}
        </Svg>
      </Animated.View>
    </View>
  );
}

/** four-point spark centred on (cx, cy) */
function spark(cx: number, cy: number, r: number) {
  const k = r * 0.28;
  return `M${cx} ${cy - r} L${cx + k} ${cy - k} L${cx + r} ${cy} L${cx + k} ${cy + k} L${cx} ${cy + r} L${cx - k} ${cy + k} L${cx - r} ${cy} L${cx - k} ${cy - k} Z`;
}

/** the status sign on the ring (bottom end corner, so the floating button's count badge at the top never covers it):
 *  a shape for each status, so colour is never the only cue */
function Sign({ tone, color }: { tone: MuntiTone; color: string }) {
  const cx = 80;
  const cy = 80;
  const w = colors.onDark;
  const line = { stroke: w, strokeWidth: 3.4, strokeLinecap: 'round' as const, fill: 'none' };
  let mark;
  switch (tone) {
    case 'gold': // ★ great
      mark = <Path d={star(cx, cy, 8)} fill={w} />;
      break;
    case 'green': // ✓ good
      mark = <Path d={`M${cx - 6} ${cy} L${cx - 2} ${cy + 5} L${cx + 6} ${cy - 5}`} {...line} strokeLinejoin="round" />;
      break;
    case 'amber': // ! watch out
      mark = (
        <>
          <Rect x={cx - 1.8} y={cy - 8} width={3.6} height={10} rx={1.8} fill={w} />
          <Circle cx={cx} cy={cy + 6} r={2} fill={w} />
        </>
      );
      break;
    case 'red': // ↓ behind
      mark = <Path d={`M${cx} ${cy - 7} L${cx} ${cy + 6} M${cx - 5} ${cy + 1} L${cx} ${cy + 6} L${cx + 5} ${cy + 1}`} {...line} strokeLinejoin="round" />;
      break;
    case 'purple': // ≡ overloaded
      mark = <Path d={`M${cx - 6} ${cy - 5} H${cx + 6} M${cx - 6} ${cy} H${cx + 6} M${cx - 6} ${cy + 5} H${cx + 6}`} {...line} strokeWidth={2.6} />;
      break;
    default: // – quiet
      mark = <Path d={`M${cx - 6} ${cy} H${cx + 6}`} {...line} />;
  }
  return (
    <>
      <Circle cx={cx} cy={cy} r={15} fill={color} stroke={w} strokeWidth={3} />
      {mark}
    </>
  );
}

/** 5-point star path centred on (cx, cy). */
function star(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    pts.push(`${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}
