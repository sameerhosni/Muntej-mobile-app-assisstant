// A progress bar for anything that takes a while (owner, 28 Oct: "add a progress bar to any activity that takes time").
// The server doesn't report progress, so the bar fills over the expected time (fast at first, slowing near the end,
// never past 95% until it's really done) and says what's happening at each stage ("Reading the names…"). When `done`
// turns true it fills to 100% and disappears a moment later.
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { ProgressBar } from './ProgressBar';

type Props = {
  /** running now */
  active: boolean;
  /** roughly how long it takes (ms) */
  expectedMs: number;
  /** what's happening, in order: shown as the bar passes each equal share of the time */
  stages: string[];
};

export function TimedProgress({ active, expectedMs, stages }: Props) {
  const [value, setValue] = useState(0);
  const [visible, setVisible] = useState(false);
  const started = useRef(0);

  useEffect(() => {
    if (active) {
      started.current = Date.now();
      setVisible(true);
      setValue(0.02);
      const id = setInterval(() => {
        const t = (Date.now() - started.current) / expectedMs;
        // eases toward 95%: quick start, slows down, never claims to be done
        setValue(Math.min(0.95, 1 - Math.exp(-2.2 * t)));
      }, 250);
      return () => clearInterval(id);
    }
    if (visible) {
      setValue(1);
      const id = setTimeout(() => setVisible(false), 600);
      return () => clearTimeout(id);
    }
  }, [active, expectedMs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;
  const stage = stages[Math.min(stages.length - 1, Math.floor((value / 0.95) * stages.length))] ?? '';
  return (
    <View style={{ gap: spacing.xs }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="caption" color="textSoft" style={{ flex: 1 }} numberOfLines={2}>
          {value >= 1 ? '✓' : stage}
        </AppText>
        <AppText variant="caption" weight="bold" style={{ color: colors.primary }}>
          {`${Math.round(value * 100)}%`}
        </AppText>
      </View>
      <ProgressBar value={value} />
    </View>
  );
}
