// Demo audio player clock for the 1-minute brief (no audio file yet — visual playback only).
import { useEffect, useRef, useState } from 'react';

export function useDemoAudio(durationSec = 60) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setPos((p) => {
        if (p + 1 >= durationSec) {
          setPlaying(false);
          return 0;
        }
        return p + 1;
      });
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, durationSec]);

  return {
    playing,
    pos,
    progress: pos / durationSec,
    toggle: () => setPlaying((p) => !p),
    stop: () => {
      setPlaying(false);
      setPos(0);
    },
  };
}

export function clock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
