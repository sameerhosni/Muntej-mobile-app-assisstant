import { Pressable, View } from 'react-native';
import { AppText } from './AppText';

type Props = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Display-face section heading with an optional link on the end side. */
export function SectionTitle({ title, actionLabel, onAction }: Props) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <AppText variant="section">{title}</AppText>
      {actionLabel && (
        <Pressable onPress={onAction} accessibilityRole="link" hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}>
          <AppText variant="caption" weight="bold" color="primary">
            {actionLabel}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}
