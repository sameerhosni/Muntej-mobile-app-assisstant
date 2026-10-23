// Marks an element Saree3's walkthrough can light up (see store.ts). It only adds a measurable wrapper.
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { walkthrough } from './store';

export function TourTarget({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View ref={(v) => walkthrough.setTarget(id, v)} collapsable={false} style={style}>
      {children}
    </View>
  );
}
