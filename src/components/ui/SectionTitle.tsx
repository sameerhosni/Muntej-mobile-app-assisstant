import { Pressable, View } from 'react-native';
import { sizes } from '@/theme/tokens';
import { AppText } from './AppText';

type Props = {
  title: string;
  /** 'muted' = small grey label (e.g. "Muntej is now…"), 'strong' = bold section header (e.g. "Subtasks"). */
  kind?: 'muted' | 'strong';
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionTitle({ title, kind = 'muted', actionLabel, onAction }: Props) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
      {kind === 'muted' ? (
        <AppText variant="small" color="textMuted">
          {title}
        </AppText>
      ) : (
        <AppText variant="cardTitleLg" weight="bold">
          {title}
        </AppText>
      )}
      {actionLabel && (
        <Pressable
          onPress={onAction}
          accessibilityRole="link"
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          style={{ minHeight: sizes.touch - 20, justifyContent: 'center' }}
        >
          <AppText variant="small" color="teal">
            {actionLabel}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}
