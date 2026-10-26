// Support chat with the Muntej team: Intercom's Messenger, opened from Saree3 (his menu), Settings and My profile;
// Intercom's own bubble stays hidden. Native app: @intercom/intercom-react-native (only in builds made with the
// Intercom keys: older builds simply don't offer it, so over-the-air updates never crash them). Web: Intercom's JS
// Messenger. The person is signed in to Intercom with a server-made identity hash (supabase/functions/support-identity).
import { useEffect, useState } from 'react';
import { AppState, Linking, NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

type Identity = { userId: string; email: string | null; name: string; role: string; company: { id: string; name: string } | null; hash: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const APP_ID = (Constants.expoConfig?.extra as { intercomAppId?: string } | undefined)?.intercomAppId ?? 'lrn5nc6m';

/** the native SDK (builds since 25 Oct include it; an older build throws on use and we say so) */
function native(): Any | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@intercom/intercom-react-native');
  } catch {
    return null;
  }
}

/** web: load Intercom's Messenger once, hidden launcher */
function webIntercom(): Any | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as Any;
  if (!w.Intercom) {
    const ic: Any = (...args: unknown[]) => ic.c(args);
    ic.q = [];
    ic.c = (args: unknown[]) => ic.q.push(args);
    w.Intercom = ic;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://widget.intercom.io/widget/${APP_ID}`;
    document.head.appendChild(s);
  }
  return w.Intercom;
}

/** open Intercom's own Messenger inside the app (off until its mobile setup in Intercom shows real content) */
const NATIVE_CHAT = false;

/** support chat is offered everywhere; a build without Intercom says so when opened */
export const supportAvailable = () => true;

let signedIn = false;

/** sign the person in to Intercom (once per app run) */
export async function loginSupport() {
  if (signedIn || !supportAvailable()) return;
  const { data } = await supabase.functions.invoke<Identity>('support-identity', { body: {} }).catch(() => ({ data: null }));
  const company = data?.company ? { id: data.company.id, name: data.company.name } : undefined;
  const sdk = native();
  if (sdk) {
    const Intercom = sdk.default;
    // Intercom shows an empty screen until someone is signed in: as the person when we know them, else as a visitor
    if (data) {
      if (data.hash) await Intercom.setUserHash(data.hash);
      if (await Intercom.isUserLoggedIn().catch(() => false)) await Intercom.logout().catch(() => {});
      await Intercom.loginUserWithUserAttributes(data.email ? { userId: data.userId, email: data.email } : { userId: data.userId });
      await Intercom.updateUser({ name: data.name, ...(company ? { companies: [company] } : {}), customAttributes: { role: data.role } }).catch(() => {});
    } else {
      await Intercom.loginUnidentifiedUser();
    }
    await Intercom.setLauncherVisibility(sdk.Visibility.GONE).catch(() => {});
  } else if (data) {
    webIntercom()?.('boot', {
      app_id: APP_ID,
      user_id: data.userId,
      email: data.email ?? undefined,
      name: data.name,
      user_hash: data.hash ?? undefined,
      company: company ? { company_id: company.id, name: company.name } : undefined,
      role: data.role,
      hide_default_launcher: true,
    });
  }
  signedIn = true;
}

/** open the conversation with the Muntej team: in the app, Intercom's Messenger (the workspace's Messenger had to be
 *  installed first: before that it opened blank); without it, the support page in the browser with a one-time link;
 *  on the web, Intercom's web chat right here.
 *  Returns the reason when it can't open (Saree3 shows it). */
export async function openSupport(opts: { tryNative?: boolean } = {}): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      await loginSupport();
      webIntercom()?.('showNewMessage');
      return null;
    }
    // the test path (long-press on the More tile): Intercom's own window with its detailed log on, to read the
    // phone's log (adb logcat) and see why it opens empty
    if (opts.tryNative) {
      const sdk = native();
      if (!sdk) return 'This build has no in-app chat';
      void diagnoseNative(sdk);
      return null;
    }
    // the Messenger inside the app (Intercom's own window, not the composer screen that crashed on 25 Oct) stays off
    // for now: in the 26 Oct build it opened an empty white screen (Intercom's mobile Messenger isn't set up yet on
    // the Intercom side). The support page in the browser works, so that's what opens until NATIVE_CHAT is turned on.
    const sdk = NATIVE_CHAT ? native() : null;
    if (sdk) {
      try {
        await loginSupport();
        await sdk.default.present();
        return null;
      } catch {
        // fall through to the browser
      }
    }
    const { data, error } = await supabase.functions.invoke<{ url: string }>('support-identity', { body: { action: 'link' } });
    if (error || !data?.url) throw new Error(error?.message ?? 'no link');
    await Linking.openURL(data.url);
    return null;
  } catch (e) {
    return (e as Error).message || String(e);
  }
}

/** The in-app chat opened empty on Android (26 Oct) and the phone's log can't be read over USB: open it step by step and
 *  write what happened (each step's result or error, Intercom's window events, whether the app went to the
 *  background as another screen came up) to activity_log ('support_debug'), so it can be read on the server. */
async function diagnoseNative(sdk: Any) {
  const t0 = Date.now();
  const steps: string[] = [];
  const note = (s: string) => steps.push(`${Date.now() - t0}ms ${s}`);
  const subs: { remove?: () => void }[] = [];
  const app = AppState.addEventListener('change', (s) => note(`app ${s}`));
  for (const [name, ev] of Object.entries((sdk.IntercomEvents ?? {}) as Record<string, string>))
    try {
      subs.push(sdk.default.addEventListener(ev, () => note(`event ${name}`)));
    } catch {
      // not on this platform
    }
  const run = async (name: string, f: () => Promise<unknown>) => {
    try {
      note(`${name} → ${JSON.stringify(await f()) ?? 'ok'}`);
    } catch (e) {
      note(`${name} ✗ ${(e as Error)?.message ?? String(e)}`);
    }
  };
  await run('setLogLevel', () => sdk.default.setLogLevel('VERBOSE'));
  await run('loggedIn before', () => sdk.default.isUserLoggedIn());
  await run('login', async () => {
    signedIn = false;
    await loginSupport();
    return 'done';
  });
  await run('loggedIn after', () => sdk.default.isUserLoggedIn());
  await run('user', () => sdk.default.fetchLoggedInUserAttributes?.());
  // the screen froze on 26 Oct before anything was written: report before opening, right after, and a bit later
  const { data: me } = await supabase.rpc('current_profile_id');
  const report = (stage: string) =>
    supabase
      .from('activity_log')
      .insert({
        actor_type: 'user',
        actor_id: me as string,
        action: 'support_debug',
        summary: `In-app chat test: ${stage}`,
        summary_ar: 'تجربة الدردشة داخل التطبيق',
        reason: JSON.stringify({ os: Platform.OS, version: Platform.Version, steps }).slice(0, 4000),
        undoable: false,
      })
      .then(
        () => {},
        () => {},
      );
  await report('before present');
  await run('present messages', () => sdk.default.presentSpace(sdk.Space.messages));
  await report('after present');
  await new Promise((r) => setTimeout(r, 4000));
  app.remove();
  for (const s of subs) s?.remove?.();
  await report('4s later');
}

/** on sign-out */
export async function logoutSupport() {
  if (!signedIn) return;
  signedIn = false;
  const sdk = native();
  if (sdk) await sdk.default.logout();
  else webIntercom()?.('shutdown');
}

/** unread replies from the team (badges). Never allowed to break a screen: any Intercom error just means 0. */
export function useUnreadSupport() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let sub: { remove?: () => void } | undefined;
    try {
      // Intercom isn't touched at all until the chat was opened once (opening More crashed on 25 Oct)
      const sdk = signedIn ? native() : null;
      if (sdk) {
        sdk.default.getUnreadConversationCount().then(setN, () => {});
        const ev = sdk.IntercomEvents?.IntercomUnreadCountDidChange;
        if (ev) sub = sdk.default.addEventListener(ev, (e: { count?: number }) => setN(e?.count ?? 0));
      } else if (Platform.OS === 'web') {
        webIntercom()?.('onUnreadCountChange', (c: number) => setN(c));
      }
    } catch {
      // no badge rather than a crash
    }
    return () => {
      try {
        sub?.remove?.();
      } catch {
        // ignore
      }
    };
  }, []);
  return n;
}
