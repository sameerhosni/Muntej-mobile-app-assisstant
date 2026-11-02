// New app versions arrive by themselves. When Muntej opens, or comes back after a minute away, it asks Expo for a newer
// update on its channel and downloads it in the background. It restarts into it only at a safe moment: when the person
// comes back to the app after a minute or more away, and never during sign-in, onboarding / setup, or while recording
// (restarting there threw people out of the onboarding mid-way). A downloaded update also applies on the next launch.
// Off in development and Expo Go.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import * as Updates from 'expo-updates';

const AWAY_MS = 60_000;
/** screens a restart must never interrupt (path prefixes; "/" alone is matched exactly) */
const NO_RESTART = [
  '/sign-in',
  '/verify',
  '/join',
  '/02-capture',
  '/13-note-taker',
  '/35-first-run',
  '/47-welcome',
  '/59-ideas',
  '/61-build-team',
  '/62-team-review',
  '/63-setup-chat',
];

let holds = 0;
/** keep the app from restarting into a new version until the returned release() runs (e.g. while recording) */
export function holdUpdates() {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
  };
}

export function useLiveUpdates() {
  const pathname = usePathname();
  const path = useRef(pathname);
  path.current = pathname;
  const busy = useRef(false);
  const ready = useRef(false);
  const leftAt = useRef(0);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    const safe = () => holds === 0 && !NO_RESTART.some((p) => path.current.startsWith(p));
    const fetchNew = async () => {
      if (busy.current || ready.current) return;
      busy.current = true;
      try {
        const found = await Updates.checkForUpdateAsync();
        if (found.isAvailable) {
          const got = await Updates.fetchUpdateAsync();
          if (got.isNew) ready.current = true;
        }
      } catch {
        // offline or Expo unreachable: try again next time
      } finally {
        busy.current = false;
      }
    };
    fetchNew();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') leftAt.current = Date.now();
      if (s !== 'active' || !leftAt.current || Date.now() - leftAt.current < AWAY_MS) return;
      if (ready.current && safe()) Updates.reloadAsync().catch(() => {});
      else fetchNew();
    });
    return () => sub.remove();
  }, []);
}
