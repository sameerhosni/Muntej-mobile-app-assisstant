import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '@/theme/tokens';

// Bar heights from the Capture mockup (design/v2/html/Capture.dc.html)
const STATIC = [10, 20, 30, 16, 34, 24, 12, 26, 8];

/** Voice bars. Static when idle; follows the mic level when `level` is given. `onDark` = white bars on a gradient. */
export function Waveform({ level, onDark }: { level?: number; onDark?: boolean }) {
  const [bars, setBars] = useState(STATIC);
  const live = level !== undefined;
  const levelRef = useRef(level ?? 0);
  levelRef.current = level ?? 0;

  useEffect(() => {
    if (!live) {
      setBars(STATIC);
      return;
    }
    const id = setInterval(() => {
      setBars((prev) => [...prev.slice(1), 8 + Math.round(levelRef.current * 28 * (0.6 + Math.random() * 0.4))]);
    }, 120);
    return () => clearInterval(id);
  }, [live]);

  const on = onDark ? colors.onDark : colors.primary;
  const off = onDark ? 'rgba(255,255,255,0.35)' : colors.borderDashed;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, direction: 'ltr' }}
    >
      {bars.map((h, i) => (
        <View key={i} style={{ width: 4, height: h, borderRadius: 2, backgroundColor: !live && i === STATIC.length - 1 ? off : on }} />
      ))}
    </View>
  );
}
