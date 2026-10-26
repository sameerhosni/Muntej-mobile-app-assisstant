// Product analytics in PostHog (US cloud), owner's request of 26 Oct: every screen people open, how long they stay,
// the path between screens, which features they use or skip, so the product-led growth work has real numbers.
//   track(event, props)   anything worth counting (feature used, Saree3 option, Home card added, idea sent…)
//   useAnalytics()        root layout: who it is (profile, role, company, language) and every screen with its time
// Never sent: task titles, messages or any other content people type; only names of screens, features and counts.
// Session recordings are off. The project key is PostHog's public client key (it is meant to sit in apps).
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/api';

const extra = (Constants.expoConfig?.extra ?? {}) as { posthogKey?: string; posthogHost?: string };
const KEY = extra.posthogKey ?? '';
const HOST = extra.posthogHost ?? 'https://us.i.posthog.com';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any | null | undefined;

/** the PostHog client, made on first use; null when it can't run here (no key, or an older build) */
function ph() {
  if (client !== undefined) return client;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PostHog } = require('posthog-react-native');
    client = KEY ? new PostHog(KEY, { host: HOST, captureAppLifecycleEvents: true, flushAt: 15, flushInterval: 20_000 }) : null;
  } catch {
    client = null;
  }
  return client;
}

/** count something; never throws */
export function track(event: string, props?: Record<string, string | number | boolean | null | undefined>) {
  try {
    ph()?.capture(event, props);
  } catch {
    // analytics must never break the app
  }
}

/** on sign-out: the next person on this phone starts fresh */
export function resetAnalytics() {
  try {
    ph()?.reset();
  } catch {
    // ignore
  }
}

/** "/14-task-detail" → "task-detail" (the screen, without its number) */
const screenName = (path: string) => (path === '/' ? 'home' : path.replace(/^\/+/, '').replace(/^\(\w+\)\//, '').replace(/^\d+-/, '') || 'home');

/** who it is, and every screen they open with the time they spent on the one before */
export function useAnalytics(signedIn: boolean) {
  const me = useMyProfile();
  const pathname = usePathname();
  const current = useRef<{ path: string; since: number } | null>(null);
  const identified = useRef<string | null>(null);

  // the person, their role and their company (a PostHog group, to compare clients)
  useEffect(() => {
    const p = me.data;
    if (!signedIn || !p || identified.current === p.id) return;
    identified.current = p.id;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: acc } = await (supabase as any).from('accounts').select('name').eq('id', p.account_id).maybeSingle();
      try {
        ph()?.identify(p.id, {
          role: p.actual_role ?? p.role,
          locale: p.locale,
          account_id: p.account_id,
          company: acc?.name ?? null,
          app_version: Constants.expoConfig?.version ?? null,
        });
        ph()?.group('company', p.account_id, { name: acc?.name ?? p.account_id });
      } catch {
        // ignore
      }
    })();
  }, [signedIn, me.data]);

  // each screen: "screen_left" with the seconds spent, then the new screen
  useEffect(() => {
    const leave = () => {
      const c = current.current;
      if (!c) return;
      track('screen_left', { screen: screenName(c.path), path: c.path, seconds: Math.round((Date.now() - c.since) / 1000) });
    };
    leave();
    current.current = { path: pathname, since: Date.now() };
    try {
      ph()?.screen(screenName(pathname), { path: pathname, signed_in: signedIn });
    } catch {
      // ignore
    }
  }, [pathname, signedIn]);

  // the app going to the background ends the visit to this screen; coming back starts a new one
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const c = current.current;
      if (!c) return;
      if (s === 'background') {
        track('screen_left', { screen: screenName(c.path), path: c.path, seconds: Math.round((Date.now() - c.since) / 1000) });
        try {
          ph()?.flush();
        } catch {
          // ignore
        }
      } else if (s === 'active') current.current = { path: c.path, since: Date.now() };
    });
    return () => sub.remove();
  }, []);
}
