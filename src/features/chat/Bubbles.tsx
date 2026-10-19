import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AlertTriangle, RotateCcw } from 'lucide-react-native';
import { AppText, Button, Gradient } from '@/components/ui';
import { Munti, type MuntiMood, type MuntiSize } from '@/features/munti/Munti';
import { colors, fontSize, radius, shadows, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { NS } from './strings';

/** Text the user or the AI wrote follows its own script, not the UI language. */
export function contentDirection(text: string) {
  return /[؀-ۿ]/.test(text) ? ('rtl' as const) : ('ltr' as const);
}

/** Muntej's face in the chat: Munti the robot. talk/celebrate settle back to idle after a moment. */
export function MuntejAvatar({ size = 'sm', mood = 'idle' }: { size?: MuntiSize; mood?: MuntiMood }) {
  const { t } = useScreenT(NS);
  return <Munti size={size} mood={mood} settleAfter={mood === 'talk' ? 2600 : undefined} label={t('avatar')} />;
}

function Time({ label, end }: { label?: string; end?: boolean }) {
  if (!label) return null;
  return (
    <AppText variant="micro" color="textFaint" align={end ? 'end' : 'start'} style={{ marginHorizontal: spacing.xs }}>
      {label}
    </AppText>
  );
}

/** Muntej's message: start side, white card, small Munti avatar. `below` renders under the bubble (task card). */
export function MuntejBubble({
  children,
  time,
  below,
  tone = 'default',
  mood,
}: {
  children: ReactNode;
  time?: string;
  below?: ReactNode;
  tone?: 'default' | 'red';
  mood?: MuntiMood;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
      <MuntejAvatar mood={mood ?? (tone === 'red' ? 'oops' : 'idle')} />
      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs, alignItems: 'flex-start' }}>
        <View
          style={{
            maxWidth: '94%',
            backgroundColor: tone === 'red' ? colors.redTint : colors.surface,
            borderRadius: 20,
            borderBottomStartRadius: 6,
            paddingVertical: spacing.lg,
            paddingHorizontal: spacing.xl,
            gap: spacing.md,
            boxShadow: tone === 'red' ? undefined : shadows.card,
          }}
        >
          {children}
        </View>
        {below}
        <Time label={time} />
      </View>
    </View>
  );
}

export function MuntejText({ text }: { text: string }) {
  return (
    <AppText style={{ fontSize: fontSize.cardTitle, lineHeight: 22, writingDirection: contentDirection(text) }}>{text}</AppText>
  );
}

/** The user's own message: end side, primary gradient, white text. */
export function UserBubble({ text, time, failed }: { text: string; time?: string; failed?: string }) {
  return (
    <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
      <View style={{ maxWidth: '82%', borderRadius: 20, borderBottomEndRadius: 6, boxShadow: shadows.primary, opacity: failed ? 0.7 : 1 }}>
        <Gradient
          name="primary"
          style={{ borderRadius: 20, borderBottomEndRadius: 6, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl }}
        >
          <AppText weight="semibold" color="onDark" style={{ fontSize: fontSize.cardTitle, lineHeight: 22, writingDirection: contentDirection(text) }}>
            {text}
          </AppText>
        </Gradient>
      </View>
      {failed ? (
        <AppText variant="micro" weight="bold" color="red" style={{ marginHorizontal: spacing.xs }}>
          {failed}
        </AppText>
      ) : (
        <Time label={time} end />
      )}
    </View>
  );
}

export function TypingBubble({ label }: { label: string }) {
  return (
    <MuntejBubble mood="think">
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <ActivityIndicator size="small" color={colors.primary} />
        <AppText color="textMuted">{label}</AppText>
      </View>
    </MuntejBubble>
  );
}

/** Red notice from Muntej (send failed, mic denied…), optionally with a Retry button. */
export function NoticeBubble({ text, onRetry, retryLabel }: { text: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <MuntejBubble tone="red">
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <AlertTriangle color={colors.red} size={16} strokeWidth={2.1} style={{ marginTop: 2 }} />
        <AppText color="textSoft" style={{ flex: 1, lineHeight: 20 }}>
          {text}
        </AppText>
      </View>
      {onRetry && retryLabel && (
        <Button
          label={retryLabel}
          size="md"
          variant="outline"
          onPress={onRetry}
          icon={<RotateCcw color={colors.primary} size={16} strokeWidth={2.2} />}
          style={{ alignSelf: 'flex-start', paddingHorizontal: spacing.xxl, borderRadius: radius.pill }}
        />
      )}
    </MuntejBubble>
  );
}
