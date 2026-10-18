// Visual-only recording demo for the Note Taker (screen 13). No microphone is used:
// a timer counts up from the design's 23:14 and the captured promises appear one by one.
import { useEffect, useState } from 'react';

export type CapturedId = 'a' | 'b' | 'c' | 'd';

/** Seconds after the screen opens at which each promise shows up (a and b are already caught, as in the design). */
const CAPTURE_AT: { id: CapturedId; at: number }[] = [
  { id: 'a', at: 0 },
  { id: 'b', at: 0 },
  { id: 'c', at: 6 },
  { id: 'd', at: 14 },
];

const START_SECONDS = 23 * 60 + 14;

/** Length of the demo meeting shown when stopped (matches Promise Catcher's "42 min"). */
export const DEMO_MEETING_MINUTES = 42;

export function useDemoRecording(running: boolean) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const total = START_SECONDS + elapsed;
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');

  return {
    time: `${mm}:${ss}`,
    tick: elapsed,
    captured: CAPTURE_AT.filter((c) => elapsed >= c.at).map((c) => c.id),
    totalPromises: CAPTURE_AT.length,
  };
}
