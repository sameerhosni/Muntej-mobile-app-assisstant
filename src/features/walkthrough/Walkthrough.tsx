// The walkthrough overlay (mounted once in app/_layout.tsx): everything dims except the current step's element,
// which gets a glowing outline; Saree3's bubble sits above or below it with one line, "Show me how" (a short live
// demo of that action), Next / Got it, and Skip. Taps on the dim area do nothing, so the eye stays on the one thing.
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { Check, Mail, User, Calendar, BellRing } from 'lucide-react-native';
import { AppText, Button } from '@/components/ui';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { useDirection } from '@/lib/i18n';
import { Munti } from '@/features/munti/Munti';
import { walkthrough, useWalkRun, type Demo } from './store';
import { WALK_NS } from './strings';

type Rect = { x: number; y: number; w: number; h: number };
const PAD = 8;
const DIM = 'rgba(11,26,51,0.74)';

export function Walkthrough() {
  const { t } = useScreenT(WALK_NS);
  const { isRTL } = useDirection();
  const run = useWalkRun();
  const { width, height } = useWindowDimensions();
  const [rect, setRect] = useState<Rect | null>(null);
  const [demo, setDemo] = useState(false);
  const glow = useState(() => new Animated.Value(0))[0];
  const step = run ? run.steps[run.at] : null;

  // find the element on screen (skip the step if it scrolled away or unmounted)
  useEffect(() => {
    setRect(null);
    setDemo(false);
    if (!step) return;
    const node = walkthrough.target(step.target);
    if (!node) return walkthrough.next();
    const id = setTimeout(
      () =>
        node.measureInWindow((x, y, w, h) => {
          if (!w || !h || y > height || y + h < 0) return walkthrough.next();
          setRect({ x: x - PAD, y: y - PAD, w: w + PAD * 2, h: h + PAD * 2 });
        }),
      120,
    );
    return () => clearTimeout(id);
  }, [step, height]);

  useEffect(() => {
    if (!rect) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [rect, glow]);

  if (!run || !step) return null;
  const last = run.at + 1 >= run.steps.length;
  // the bubble goes where there's more room
  const below = rect ? rect.y + rect.h / 2 < height / 2 : true;

  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={() => walkthrough.end(false)}>
      {!rect ? (
        <View style={{ flex: 1, backgroundColor: DIM }} />
      ) : (
        // positions are measured on screen (left = physical left): this layer stays LTR so an Arabic layout doesn't mirror
        // the outline to the other side; the bubble's own text follows the app language
        <View style={{ flex: 1, direction: 'ltr' }}>
          {/* the dim around the lit element (four panels, the element itself stays clear) */}
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(0, rect.y), backgroundColor: DIM }} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: rect.y + rect.h, bottom: 0, backgroundColor: DIM }} />
          <View style={{ position: 'absolute', left: 0, width: Math.max(0, rect.x), top: rect.y, height: rect.h, backgroundColor: DIM }} />
          <View style={{ position: 'absolute', left: rect.x + rect.w, right: 0, top: rect.y, height: rect.h, backgroundColor: DIM }} />
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              borderRadius: radius.tile,
              borderWidth: 3,
              borderColor: '#FFD60A',
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }],
            }}
          />

          {/* Saree3's bubble */}
          <View
            style={{
              position: 'absolute',
              left: spacing.screen,
              width: width - spacing.screen * 2,
              ...(below ? { top: rect.y + rect.h + 14 } : { bottom: height - rect.y + 14 }),
              backgroundColor: colors.surface,
              borderRadius: radius.cardLg,
              padding: spacing.lg,
              gap: spacing.sm,
              boxShadow: shadows.raised,
              direction: isRTL ? 'rtl' : 'ltr',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
              <Munti size="md" mood={demo ? 'celebrate' : 'talk'} />
              <View style={{ flex: 1, gap: 4 }}>
                <AppText weight="extrabold" style={{ fontSize: 17 }}>
                  {step.title ?? t(`${step.key}Title`)}
                </AppText>
                <AppText color="textSoft">{step.body ?? t(`${step.key}Body`)}</AppText>
              </View>
            </View>
            {demo && step.demo && <DemoView kind={step.demo} />}
            {/* "1 of 3" on its own line, the buttons below it (side by side they squeezed it onto 3 lines) */}
            {run.steps.length > 1 && (
              <AppText variant="caption" color="textFaint" numberOfLines={1}>
                {t('step', { at: run.at + 1, n: run.steps.length })}
              </AppText>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm }}>
              <Pressable onPress={() => walkthrough.end(false)} accessibilityRole="button" hitSlop={8} style={{ padding: 8 }}>
                <AppText weight="semibold" color="textMuted">
                  {t('skip')}
                </AppText>
              </Pressable>
              {!!step.demo && !demo && (
                <View style={{ flexDirection: 'row' }}>
                  <Button label={t('showMe')} size="md" variant="outline" onPress={() => setDemo(true)} />
                </View>
              )}
              <View style={{ flexDirection: 'row' }}>
                <Button label={last ? t('done') : t('next')} size="md" onPress={() => walkthrough.next()} />
              </View>
            </View>
          </View>
        </View>
      )}
    </Modal>
  );
}

/** "Show me how": the action playing out in a few beats, so you see what happens before you try */
function DemoView({ kind }: { kind: Demo }) {
  const { t } = useScreenT(WALK_NS);
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    setBeat(0);
    const ids = [1, 2, 3, 4].map((b) => setTimeout(() => setBeat(b), b * 700));
    return () => ids.forEach(clearTimeout);
  }, [kind]);
  const line = (on: boolean, icon: ReactNode, text: string) =>
    on ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {icon}
        <AppText variant="small" weight="semibold">
          {text}
        </AppText>
      </View>
    ) : null;
  return (
    <View style={{ gap: 6, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryTint }}>
      {kind === 'say' && (
        <>
          <AppText weight="bold" color="primary">
            🎤 «{t('demoSay').slice(0, Math.min(t('demoSay').length, 8 + beat * 12))}»
          </AppText>
          {line(beat >= 2, <User color={colors.primary} size={14} />, t('demoWho'))}
          {line(beat >= 3, <Calendar color={colors.primary} size={14} />, t('demoWhen'))}
          {line(beat >= 4, <BellRing color={colors.primary} size={14} />, t('demoCheck'))}
        </>
      )}
      {kind === 'tick' && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                borderWidth: 2,
                borderColor: beat >= 1 ? colors.green : colors.borderBlue,
                backgroundColor: beat >= 1 ? colors.green : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {beat >= 1 && <Check color={colors.onDark} size={14} strokeWidth={3} />}
            </View>
            <AppText weight="semibold" style={{ textDecorationLine: beat >= 1 ? 'line-through' : 'none' }}>
              {t('demoTick')}
            </AppText>
          </View>
          {line(beat >= 2, <Check color={colors.green} size={14} />, t('demoTicked'))}
        </>
      )}
      {kind === 'add' && (
        <>
          {line(true, <Mail color={colors.primary} size={14} />, t('demoMail'))}
          {line(beat >= 2, <Check color={colors.green} size={14} />, t('demoAdded'))}
        </>
      )}
      {kind === 'approve' && line(beat >= 1, <Check color={colors.green} size={14} />, t('demoApprove'))}
    </View>
  );
}
