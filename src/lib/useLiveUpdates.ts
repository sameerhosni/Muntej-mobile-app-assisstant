// New app versions arrive by themselves: when Muntej opens, or comes back to the screen after a minute away, it asks
// Expo for a newer update on its channel; if there is one it downloads it and restarts into it right away (by default
// Expo only switches on the NEXT launch, so people had to close the app twice). Off in development and Expo Go.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

const AWAY_MS = 60_000;

export function useLiveUpdates() {
  const busy = useRef(false);
  const leftAt = useRef(0);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    const check = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const found = await Updates.checkForUpdateAsync();
        if (found.isAvailable) {
          const got = await Updates.fetchUpdateAsync();
          if (got.isNew) await Updates.reloadAsync();
        }
      } catch {
        // offline or Expo unreachable: try again next time
      } finally {
        busy.current = false;
      }
    };
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') leftAt.current = Date.now();
      if (s === 'active' && leftAt.current && Date.now() - leftAt.current > AWAY_MS) check();
    });
    return () => sub.remove();
  }, []);
}
