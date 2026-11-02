// Shared states for screens that have no real data yet. The rule everywhere: while loading → LoadingCard (never the
// design's sample numbers); nothing yet → EmptyCard with real zeros around it and an optional "Show me an example";
// the example only after that tap, always marked with SampleTag.
import type { ComponentType } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import type { LucideProps } from 'lucide-react-native';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { Card } from './Card';
import { IconBadge } from './IconBadge';

export function LoadingCard() {
  return (
    <Card elevation="raised" style={{ alignItems: 'center', paddingVertical: 28 }}>
      <ActivityIndicator color={colors.primary} />
    </Card>
  );
}

type EmptyProps = {
  icon: ComponentType<LucideProps>;
  title: string;
  body?: string;
  /** "Show me an example" label; the button shows only with onSample */
  sampleLabel?: string;
  onSample?: () => void;
};

export function EmptyCard({ icon: Icon, title, body, sampleLabel, onSample }: EmptyProps) {
  return (
    <Card elevation="raised" style={{ alignItems: 'center', paddingVertical: 28, gap: spacing.md }}>
      <IconBadge size={52} round bg="primaryTint">
        <Icon color={colors.primary} size={26} strokeWidth={2} />
      </IconBadge>
      <AppText variant="section" align="center">
        {title}
      </AppText>
      {!!body && (
        <AppText color="textMuted" align="center">
          {body}
        </AppText>
      )}
      {!!onSample && !!sampleLabel && (
        <Pressable
          onPress={onSample}
          accessibilityRole="button"
          style={{ minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: spacing.lg }}
        >
          <AppText variant="small" weight="bold" color="primary">
            {sampleLabel}
          </AppText>
        </Pressable>
      )}
    </Card>
  );
}

/** "Sample" pill next to a title while the screen shows the design's example; onDark for heroes */
export function SampleTag({ label, onDark }: { label: string; onDark?: boolean }) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: onDark ? colors.glass : colors.amberTint,
        borderWidth: onDark ? 1 : 0,
        borderColor: colors.glassBorder,
        borderRadius: radius.pill,
        paddingHorizontal: 8,
        paddingVertical: 1,
      }}
    >
      <AppText variant="micro" weight="bold" color={onDark ? 'onDark' : 'amber'}>
        {label}
      </AppText>
    </View>
  );
}
