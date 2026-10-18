import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '@/theme/tokens';

// Bar heights from the Capture mockup (design/html/Capture.dc.html)
const STATIC = [10, 22, 34, 18, 40, 26, 14, 30, 20, 8, 8];

/** Teal voice bars. Static when idle; follows the mic level when `level` is given. */
export function Waveform({ level }: { level?: number }) {
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
      setBars((prev) => [...prev.slice(1), 8 + Math.round(levelRef.current * 32 * (0.6 + Math.random() * 0.4))]);
    }, 120);
    return () => clearInterval(id);
  }, [live]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 44, direction: 'ltr' }}
    >
      {bars.map((h, i) => (
        <View
          key={i}
          style={{
            width: 4,
            height: h,
            borderRadius: 2,
            backgroundColor: !live && i >= STATIC.length - 2 ? colors.textDim : colors.teal,
          }}
        />
      ))}
    </View>
  );
}
